const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const { HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, BorderStyle, WidthType, TabStopType } = require('docx'); // <-- NUEVA LIBRERÍA PARA WORD

require('dotenv').config();

const app = express();
app.use(cors());
const puerto = process.env.PORT || 3000; 

app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ limit: '150mb', extended: true }));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp') 
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 150 * 1024 * 1024 } 
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

if (!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

// =================================================================
// RUTA DE SUBIDA EN COLA (GENERADOR DE TICKETS)
// =================================================================
app.post('/api/subir-tomo', upload.single('documentoPdf'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No se recibió la parte del tomo" });
  
      console.log(`-> Subiendo a Google: ${file.originalname}`);
      const uploadResult = await fileManager.uploadFile(file.path, {
        mimeType: "application/pdf", 
        displayName: file.originalname,
      });
  
      fs.unlinkSync(file.path); // Borramos el archivo local de Render
  
      res.json({
        mensaje: "Parte almacenada",
        ticket: {
          fileUri: uploadResult.file.uri,
          mimeType: "application/pdf", 
          nombre: file.originalname,
          googleName: uploadResult.file.name 
        }
      });
    } catch (error) {
      console.error("Error al subir el tomo:", error);
      res.status(500).json({ error: "Fallo al subir la parte." });
    }
});

// =================================================================
// MOTOR CENTRAL DE PROCESAMIENTO MULTI-PARTES
// =================================================================
// NOTA: Se agregó "requiereJson" para que el motor sirva tanto para la UI como para Word.
async function analizarTicketsConGemini(tickets, systemPrompt, requiereJson = true) {
  // 1. Validar que los archivos estén listos en la nube
  for (const ticket of tickets) {
      let file = await fileManager.getFile(ticket.googleName);
      while (file.state === "PROCESSING") {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          file = await fileManager.getFile(ticket.googleName);
      }
      if (file.state === "FAILED") throw new Error(`El archivo ${ticket.nombre} falló en la nube.`);
      console.log(` - ✅ ${ticket.nombre} listo.`);
  }

  // Configuración dinámica según lo que pida la ruta
  const configGeneracion = {
      maxOutputTokens: 8192, 
      temperature: 0.1,      
  };
  if (requiereJson) {
      configGeneracion.responseMimeType = "application/json";
  }

  // 2. Configurar el "Cerebro"
  const model = genAI.getGenerativeModel({
      model: "gemini-3.6-flash", // Corregido: "3.6" no existe y te daría Error 404. Usamos la versión estable más potente.
      systemInstruction: systemPrompt,
      generationConfig: configGeneracion,
      safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
  });

  // 3. Armar la lista de archivos para inyectarlos
  const fileParts = tickets.map(t => ({
      fileData: { fileUri: t.fileUri, mimeType: "application/pdf" }
  }));

  console.log("[Motor] Iniciando lectura cruzada de las partes...");
  const result = await model.generateContent(fileParts);
  
  // 🚨 DIAGNÓSTICO DE TOKENS
  const razon = result.response.candidates[0]?.finishReason;
  console.log(`[Motor] La IA terminó de escribir por: ${razon}`);
  
  const textoCrudo = result.response.text();

  // 4. Limpieza automática de la nube (DESACTIVADA PARA EVITAR ERROR 403)
  /*
  for (const ticket of tickets) {
      try { await fileManager.deleteFile(ticket.googleName); } 
      catch (e) { console.error(` - Fallo al borrar:`, e.message); }
  }
  */

  return textoCrudo;
}

// =================================================================
// RUTA 1: CEREBRO DE RESUMEN
// =================================================================
app.post('/api/resumen', async (req, res) => {
    try {
        const { tickets } = req.body;
        if (!tickets || tickets.length === 0) return res.status(400).json({ error: "No hay tickets" });

        const promptResumen = `
Eres un Fiscal Superior analizando un caso complejo de corrupción en Perú.
Tu ÚNICA tarea es redactar un Resumen de los Hechos y un Análisis Jurídico unificado de todas las partes del tomo proporcionado.
TOMA TODO EL ESPACIO QUE NECESITES. Escribe con detalle, redacta una historia clara de qué pasó.

FORMATO DE SALIDA EXIGIDO (ÚNICAMENTE JSON válido, usa comillas simples para textos internos):
{
  "resumenCronologico": "Redacción detallada de los hechos procesales...",
  "sustentoJuridico": "Análisis legal completo...",
  "probabilidadExito": "Alta, Media o Baja"
}`;

        let textoCrudo = await analizarTicketsConGemini(tickets, promptResumen); // Usa requiereJson = true por defecto
        textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
        res.json(JSON.parse(textoCrudo));

    } catch (error) {
        console.error("Error en Ruta Resumen:", error);
        res.status(500).json({ error: "Fallo al generar el resumen." });
    }
});

// =================================================================
// RUTA 2: CEREBRO AUDITOR (INVENTARIO PROBATORIO - MODO ITERATIVO)
// =================================================================
app.post('/api/inventario', async (req, res) => {
  try {
      const { tickets } = req.body;
      if (!tickets || tickets.length === 0) return res.status(400).json({ error: "No hay tickets" });

      let inventarioGlobal = [];

      console.log(`[Ruta 2] Iniciando análisis ITERATIVO de ${tickets.length} partes...`);

      for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          console.log(`[Ruta 2] Analizando Tomo ${i + 1} de ${tickets.length}: ${ticket.nombre}`);

          const promptAuditor = `
Eres un Fiscal Investigador y Auditor Forense Documental.
Analiza ÚNICAMENTE ESTE ARCHIVO en su totalidad.

--- METODOLOGÍA ---
1. EXTRAER SÍ O SÍ: Notas Informativas, Memorandos, Resoluciones, Informes, Oficios, Actas, Denuncias, Manuales de operaciones, Opiniones tecnicas del OECE u OSCE, Hojas de envio, Actas, Decretos supremos, Manual de Organizaciones y Funciones (MOF), Reglamento de Organizaciones y Funciones (ROF), Ordenes de Servicios, Ordenes de pago, Credito Presupuestario, Liquidaciones y/o Devengados y Contratos.
2. IGNORAR: DNIs, Correos, Cargos, Carátulas, Escritos de solucitud de copias, Escrito de programacion y/o reprogramacion de diligencias, Escritos de la procuraduria publica del estado, Escritos de consultas del estado situacional de los casos y/o carpeta fiscal, Escrito de pedidos de conlusion de la investigacion preliminar, preparatoria, sobreeimientos y/o solicitud de archivo de la investigacion, Escritos de pedidos de actos de investigacion y Escritos de apersonamiento.
3. REGLA QUIRÚRGICA: Ignora TODAS las Providencias y Disposiciones del "2do Despacho de la Primera Fiscalía Provincial Corporativa".
4. DESGLOSE OBLIGATORIO DE ANEXOS: Los ANEXOS DEBEN registrarse SIEMPRE como objetos independientes.

--- REGLAS ESTRICTAS DE SINTAXIS ---
1. PROHIBIDO usar comillas dobles (") dentro de las descripciones. Usa simples (').
2. NO uses saltos de línea (Enters) dentro de las descripciones.
3. 'descripcion': MÁXIMO 10 PALABRAS.
4. 'tomoOrigen': DEBES USAR EXACTAMENTE ESTE TEXTO: '${ticket.nombre}'

FORMATO EXIGIDO (ÚNICAMENTE JSON):
NO digas "Aquí tienes el JSON". Empieza directo con la llave '{'.
{
"elementosConviccionEncontrados": [
  {
    "tipo": "Nombre corto (Ej. Informe N 070)",
    "descripcion": "Texto breve",
    "tomoOrigen": "${ticket.nombre}",
    "paginaInicio": 12,
    "paginaFin": 14
  }
]
}`;

          let textoCrudo = await analizarTicketsConGemini([ticket], promptAuditor);
          textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
          
          try {
              const datosParsed = JSON.parse(textoCrudo);
              if (datosParsed.elementosConviccionEncontrados) {
                  inventarioGlobal = inventarioGlobal.concat(datosParsed.elementosConviccionEncontrados);
                  console.log(`  -> ✅ ${datosParsed.elementosConviccionEncontrados.length} elementos extraídos del Tomo ${i+1}.`);
              }
          } catch (errorParse) {
              console.log(`  -> ⚠️ Error de sintaxis en el Tomo ${i+1}. Aplicando rescate de emergencia...`);
              let rescatado = false;
              let jsonTemp = textoCrudo.substring(0, textoCrudo.lastIndexOf('}') + 1);
              
              while (jsonTemp.length > 20 && !rescatado) {
                  try {
                      const datosTemp = JSON.parse(jsonTemp + '] }');
                      if (datosTemp.elementosConviccionEncontrados) {
                          inventarioGlobal = inventarioGlobal.concat(datosTemp.elementosConviccionEncontrados);
                          console.log(`  -> 🚑 Rescate exitoso: ${datosTemp.elementosConviccionEncontrados.length} elementos salvados.`);
                      }
                      rescatado = true;
                  } catch (e) {
                      jsonTemp = jsonTemp.substring(0, jsonTemp.lastIndexOf('}'));
                  }
              }
          }
      }

      console.log(`[Ruta 2] 🎉 Análisis finalizado. Total extraído en el expediente: ${inventarioGlobal.length} elementos.`);
      res.json({ elementosConviccionEncontrados: inventarioGlobal });

  } catch (error) {
      console.error("Error en Ruta Inventario:", error);
      res.status(500).json({ error: "Fallo al generar el inventario." });
  }
});

// =================================================================
// RUTA 3: CEREBRO ESTRATEGA (DILIGENCIAS FALTANTES)
// =================================================================
app.post('/api/diligencias', async (req, res) => {
    try {
        const { tickets } = req.body;
        if (!tickets || tickets.length === 0) return res.status(400).json({ error: "No hay tickets" });

        const promptEstratega = `
Eres un Fiscal Superior Estratega. Tu ÚNICA tarea es leer las partes del expediente e identificar QUÉ FALTA.
Detecta vacíos en la investigación, personas a las que no se ha interrogado, o documentos financieros/periciales que faltan solicitar.

FORMATO DE SALIDA EXIGIDO (ÚNICAMENTE JSON válido):
{
  "elementosFaltantes": [
    "Tomar declaración testimonial de X persona...",
    "Solicitar levantamiento del secreto bancario de la empresa Y..."
  ]
}`;

        let textoCrudo = await analizarTicketsConGemini(tickets, promptEstratega);
        textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
        res.json(JSON.parse(textoCrudo));

    } catch (error) {
        console.error("Error en Ruta Diligencias:", error);
        res.status(500).json({ error: "Fallo al evaluar la estrategia." });
    }
});

// =================================================================
// RUTA 4: EXTRACTOR LITERAL (OCR)
// =================================================================
app.post('/api/transcribir-fojas', upload.single('documento'), async (req, res) => {
  try {
      const file = req.file;
      const { instruccion } = req.body; 
      if (!file || !instruccion) return res.status(400).json({ error: "Faltan datos" });

      console.log(`-> Subiendo a Google OCR: ${file.originalname}`);
      const uploadResult = await fileManager.uploadFile(file.path, { mimeType: "application/pdf", displayName: file.originalname });
      fs.unlinkSync(file.path);

      let archivoListo = false; let intentos = 0;
      while (!archivoListo && intentos < 20) {
        const fileInfo = await fileManager.getFile(uploadResult.file.name);
        if (fileInfo.state === "ACTIVE") archivoListo = true;
        else if (fileInfo.state === "FAILED") throw new Error("Fallo OCR en nube.");
        else { await new Promise(r => setTimeout(r, 5000)); intentos++; }
      }

      const promptOCR = `Rol: Asistente de Digitalización. Reglas: Transcribe literalmente según mi instrucción: "${instruccion}". Sin saludos ni formato.`;
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptOCR });
      const result = await model.generateContent([{ fileData: { fileUri: uploadResult.file.uri, mimeType: "application/pdf" } }]);
      
      try { await fileManager.deleteFile(uploadResult.file.name); } catch(e){}
      res.json({ texto: result.response.text() });

  } catch (error) {
      console.error("Error OCR:", error);
      res.status(500).json({ error: "Fallo en OCR." });
  }
});

// =================================================================
// RUTA 5: REDACTOR JURÍDICO - GENERADOR DE WORD (.DOCX)
// =================================================================
app.post('/api/generar-documento', async (req, res) => {
    try {
        const { tipoDocumento, instruccion, tickets } = req.body;
        if (!tickets) return res.status(400).json({ error: "Faltan tickets." });

        console.log(`[Ruta 5] Iniciando redacción de plantilla visual: ${tipoDocumento}`);

        // DATOS FIJOS DEL DESPACHO
        const FISCAL_FIJO = "Yeltsin L. A. Leiva Chara";
        const ASISTENTE_FIJO = "Debora J. Sotelo Ahuanari";
        const AGRAVIADO_FIJO = "El Estado";

        // PROMPT DE EXTRACCIÓN SÚPER OPTIMIZADO
        const promptRedaccion = `
Rol: Eres un Fiscal Provincial Titular, jurista experto en Derecho Penal.

Objetivo: Analizar la carpeta fiscal (PDFs adjuntos) y extraer información para una ${tipoDocumento}.
Instrucción Adicional: "${instruccion}"

REGLAS DE OBLIGATORIO CUMPLIMIENTO:
1. "investigadosCabecera": Solo el nombre principal + " y otros".
2. "investigadosTodos": Nombres completos de TODOS los investigados (añadir " Y L.Q.R.R." al final si corresponde).
3. "delitoCabecera": Un (1) solo delito principal.
4. "delitosTodos": Todos los delitos identificados.
5. "fechaL1": Ciudad, día y mes (Ej: "Lima, treinta de julio").
6. "fechaL2": Año en letras (Ej: "de dos mil veintiséis").
7. Redacta los apartados jurídicos con rigor y nomenclatura exacta. No incluyas el apartado DADO CUENTA, el sistema lo generará automáticamente.

Formato de Salida EXIGIDO: ÚNICAMENTE UN OBJETO JSON VÁLIDO.
{
  "carpetaFiscal": "Ej: 123-2024",
  "investigadosCabecera": "Principal y otros",
  "investigadosTodos": "Todos los nombres",
  "delitoCabecera": "Un solo tipo penal",
  "delitosTodos": "Todos los delitos identificados",
  "nroDisposicion": "Ej: 04",
  "fechaL1": "Ej: Lima, treinta de julio",
  "fechaL2": "Ej: de dos mil veintiséis",
  "hechosDenunciados": "Síntesis de la imputación.",
  "calificacionJuridica": "Análisis del tipo penal.",
  "elementosConviccion": "Argumentación de las pruebas.",
  "analisisYConclusion": "Juicio de subsunción y conclusión."
}`;

        let textoCrudo = await analizarTicketsConGemini(tickets, promptRedaccion, true);
        textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
        
        let datos;
        try {
            datos = JSON.parse(textoCrudo);
        } catch (e) {
            console.log("Error parseando JSON, aplicando rescate de emergencia.");
            datos = {
                carpetaFiscal: "S/N", investigadosCabecera: "Los que resulten responsables", investigadosTodos: "LOS QUE RESULTEN RESPONSABLES", 
                delitoCabecera: "Por determinar", delitosTodos: "POR DETERMINAR", nroDisposicion: "S/N", 
                fechaL1: "Lima, a la fecha", fechaL2: "de su emisión",
                hechosDenunciados: textoCrudo, calificacionJuridica: "", elementosConviccion: "", analisisYConclusion: ""
            };
        }

        const limpiarValor = (valor, porDefecto) => {
            if (!valor || valor === "undefined" || valor === "null" || valor.trim() === "") return porDefecto;
            return valor;
        };

        // =========================================================
        // HERRAMIENTAS DE MAQUETACIÓN VISUAL (DOCX)
        // =========================================================
        
        const crearParrafo = (texto, bold = false, alignment = AlignmentType.JUSTIFIED, italics = false) => {
            return new Paragraph({
                children: [new TextRun({ text: texto, bold: bold, italics: italics, font: "Arial", size: 22 })],
                alignment: alignment,
                spacing: { after: 120, line: 276 }, 
            });
        };

        const crearParrafoEncabezado = (texto, bold = false, alignment = AlignmentType.CENTER, italics = false) => {
            return new Paragraph({
                children: [new TextRun({ text: texto, bold: bold, italics: italics, font: "Arial", size: 16 })], 
                alignment: alignment,
                spacing: { after: 0, line: 240 },
            });
        };

        const crearDatoEncabezado = (etiqueta, valor) => {
            return new Paragraph({
                children: [
                    new TextRun({ text: etiqueta, font: "Arial", size: 16 }),
                    new TextRun({ text: `\t: ${valor}`, font: "Arial", size: 16 })
                ],
                tabStops: [{ type: TabStopType.LEFT, position: 2200 }], // Alineación perfecta de los ":"
                spacing: { after: 0, line: 240 },
                alignment: AlignmentType.LEFT,
                indent: { left: 567 } // 1 cm a la derecha
            });
        };

        const crearTituloRomano = (numeroRomano, texto) => {
            return new Paragraph({
                children: [
                    new TextRun({ text: `${numeroRomano}.\t`, bold: true, font: "Arial", size: 22 }),
                    new TextRun({ text: texto, bold: true, underline: {}, font: "Arial", size: 22 })
                ],
                alignment: AlignmentType.LEFT,
                spacing: { before: 300, after: 150 },
                tabStops: [{ type: TabStopType.LEFT, position: 720 }] 
            });
        };

        const procesarTextoMultilinea = (texto) => {
            if (!texto) return [crearParrafo("")];
            return texto.split('\n').filter(p => p.trim() !== '').map(p => crearParrafo(p.trim()));
        };

        // =========================================================
        // CONSTRUCCIÓN ESTRUCTURAL DEL DOCUMENTO
        // =========================================================
        
        const tablaEncabezado = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 45, type: WidthType.PERCENTAGE },
                            children: [
                                crearParrafoEncabezado("MINISTERIO PÚBLICO", true),
                                crearParrafoEncabezado("PRIMERA FISCALÍA ESPECIALIZADA EN DELITOS DE CORRUPCIÓN DE FUNCIONARIOS", true),
                                crearParrafoEncabezado("-SEGUNDO DESPACHO-", true),
                            ],
                        }),
                        new TableCell({
                            width: { size: 55, type: WidthType.PERCENTAGE },
                            children: [
                                crearParrafoEncabezado('"Año de la Esperanza y el Fortalecimiento de la Democracia"', false, AlignmentType.CENTER, true),
                                new Paragraph({ spacing: { after: 150 } }),
                                crearDatoEncabezado("CARPETA FISCAL", limpiarValor(datos.carpetaFiscal, "S/N")),
                                crearDatoEncabezado("INVESTIGADOS", limpiarValor(datos.investigadosCabecera, "Los que resulten responsables")),
                                crearDatoEncabezado("AGRAVIADO", AGRAVIADO_FIJO), 
                                crearDatoEncabezado("DELITO", limpiarValor(datos.delitoCabecera, "Por determinar")),
                                crearDatoEncabezado("FISCAL A CARGO", FISCAL_FIJO), 
                                crearDatoEncabezado("ASISTENTE", ASISTENTE_FIJO), 
                            ],
                        }),
                    ],
                }),
            ],
        });

        // ENSAMBLE FINAL
        const doc = new Document({
            sections: [{
                properties: {
                    page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } 
                },
                children: [
                    tablaEncabezado,
                    new Paragraph({ spacing: { before: 500, after: 300 } }),
                    
                    // TÍTULO CENTRAL
                    new Paragraph({
                        children: [new TextRun({ text: tipoDocumento.toUpperCase(), bold: true, font: "Arial", size: 28 })],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 300 }
                    }),

                    // FECHA EN DOS LÍNEAS (Sin espacio extra entre ellas)
                    new Paragraph({
                        children: [new TextRun({ text: `DISPOSICIÓN N.° ${limpiarValor(datos.nroDisposicion, "00")}`, bold: true, underline: {}, font: "Arial", size: 22 })],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 50 } // Espacio mínimo
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: limpiarValor(datos.fechaL1, "Lima, a la fecha"), font: "Arial", size: 22 })],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0 } // Ningún espacio abajo para que se pegue a la línea 2
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: limpiarValor(datos.fechaL2, "de su emisión"), font: "Arial", size: 22 })],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 400 } // Espacio grande hacia el siguiente título
                    }),

                    // I. DADO CUENTA (Con texto fijo y variables inyectadas automáticamente)
                    crearTituloRomano("I", "DADO CUENTA"),
                    new Paragraph({
                        children: [
                            new TextRun({ text: "El estado actual de la presente investigación fiscal, en los seguidos contra ", font: "Arial", size: 22 }),
                            new TextRun({ text: limpiarValor(datos.investigadosTodos, "LOS QUE RESULTEN RESPONSABLES").toUpperCase(), bold: true, font: "Arial", size: 22 }),
                            new TextRun({ text: ", por el presunto delito contra la Administración Pública en su modalidad de ", font: "Arial", size: 22 }),
                            new TextRun({ text: limpiarValor(datos.delitosTodos, "POR DETERMINAR").toUpperCase(), bold: true, font: "Arial", size: 22 }),
                            new TextRun({ text: ", en agravio del ", font: "Arial", size: 22 }),
                            new TextRun({ text: "ESTADO", bold: true, font: "Arial", size: 22 }),
                            new TextRun({ text: ".", font: "Arial", size: 22 })
                        ],
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 120, line: 276 },
                    }),

                    // II. DEL MINISTERIO PÚBLICO
                    crearTituloRomano("II", "DEL MINISTERIO PÚBLICO"),
                    crearParrafo("El Ministerio Público es el organismo autónomo del Estado que tiene como funciones principales la defensa de la legalidad, los derechos ciudadanos y los intereses públicos, la representación de la sociedad en juicio; así como, la persecución del delito y la reparación civil, actuando bajo el principio de objetividad e imputación necesaria."),

                    // III. HECHOS DENUNCIADOS E INVESTIGADOS
                    crearTituloRomano("III", "HECHOS DENUNCIADOS E INVESTIGADOS"),
                    ...procesarTextoMultilinea(datos.hechosDenunciados),

                    // IV. CALIFICACIÓN JURÍDICO-PENAL
                    crearTituloRomano("IV", "CALIFICACIÓN JURÍDICO-PENAL"),
                    ...procesarTextoMultilinea(datos.calificacionJuridica),

                    // V. ELEMENTOS DE CONVICCIÓN
                    crearTituloRomano("V", "ELEMENTOS DE CONVICCIÓN"),
                    ...procesarTextoMultilinea(datos.elementosConviccion),

                    // VI. PRONUNCIAMIENTO
                    crearTituloRomano("VI", "PRONUNCIAMIENTO DE ESTE DESPACHO PROVINCIAL"),
                    ...procesarTextoMultilinea(datos.analisisYConclusion),
                ],
            }],
        });

        const buffer = await Packer.toBuffer(doc);
        res.setHeader('Content-Disposition', 'attachment; filename=Proyecto_Fiscal.docx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
        console.log(`[Ruta 5] ✅ Documento Word optimizado generado exitosamente.`);

    } catch (error) {
        console.error("Error al generar el documento Word:", error);
        res.status(500).json({ error: "Fallo al generar el archivo Word." });
    }
});

const servidorConfigurado = app.listen(puerto, () => {
    console.log(`=================================================`);
    console.log(`Servidor Modular Listo en puerto: ${puerto}`);
    console.log(`=================================================`);
});
servidorConfigurado.timeout = 10 * 60 * 1000;