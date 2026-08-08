const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const { HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
 // <-- NUEVA LIBRERÍA PARA WORD
const { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, BorderStyle, WidthType, TabStopType, FootnoteReferenceRun } = require('docx');
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
app.post('/api/generar-documento', async (req, res) => {
    try {
        const { tipoDocumento, instruccion, tickets } = req.body;
        if (!tickets) return res.status(400).json({ error: "Faltan tickets." });

        console.log(`[Ruta 5] Iniciando redacción de plantilla visual: ${tipoDocumento}`);

        // DATOS FIJOS DEL DESPACHO
        const FISCAL_FIJO = "Yeltsin L. A. Leiva Chara";
        const ASISTENTE_FIJO = "Debora J. Sotelo Ahuanari";
        const AGRAVIADO_FIJO = "El Estado";

        // PROMPT DE EXTRACCIÓN CON EXPANSIÓN DOGMÁTICA Y FÁCTICA
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
7. REGLA PARA HECHOS DENUNCIADOS ("hechosDenunciados"): NO RESUMAS. Redacta de forma EXTENSA, EXHAUSTIVA y DETALLADA. Construye una narrativa cronológica profunda, explicando el contexto de la entidad, el rol específico de cada investigado, los montos, las irregularidades detectadas y cómo se desarrollaron los hechos. Obligatorio: Divide esta narración en un arreglo (array) de múltiples párrafos largos y robustos (mínimo 4 a 6 párrafos). NO incluyas números ni viñetas al inicio, el sistema los numerará.
8. REGLA PARA CALIFICACIÓN JURÍDICA ("calificacionJuridica"): El análisis debe ser MUY EXTENSO y PROFUNDO (Nivel Dogmático Superior). Devuelve OBLIGATORIAMENTE un ARREGLO de textos (Array). Aplica esta estructura exacta:
   - "En ese sentido, tenemos que el hecho denunciado se comprendería en el delito de [DELITO], es por ello que este despacho fiscal debe definir dicho delito con la finalidad de que al momento de analizar los hechos denunciados veamos si se tienen elementos que acrediten la comisión del hecho imputado."
   - "1. El delito de [DELITO] previsto en el artículo [X] del Código Penal, cuyo texto es el siguiente: [REDACTA EL TEXTO EXACTO DEL CÓDIGO PENAL APLICABLE]."
   - "1.1. Ahora bien, entrando al análisis de la tipicidad para este delito, el comportamiento típico se presenta cuando..." (Aplica un análisis dogmático extenso de 6 a 8 líneas sobre la naturaleza del delito).
   - "1.2. En su construcción del tipo penal, se observa la concurrencia de diversos elementos, que a continuación se detalla:"
   - "● Verbo rector: [Explicación dogmática EXTENSA y detallada de la acción típica. Cita jurisprudencia si es posible]."
   - "● Bien jurídico protegido: [Explicación amplia y teórica del bien jurídico tutelado]."
   - "● Sujeto activo: [Explicación detallada de la cualidad especial que exige el tipo penal para el autor]."
   - "● Sujeto pasivo: [Identificación y explicación de por qué el Estado o la entidad es el agraviado]."
   - "● [Otro elemento relevante si aplica, ej. Provecho propio o de tercero]: [Explicación extensa]."

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
  "hechosDenunciados": [
    "Narrativa extensa y detallada del contexto y los hallazgos...",
    "Explicación exhaustiva del rol de los funcionarios y las irregularidades...",
    "Detalle de montos, fechas y consecuencias precisas..."
  ],
  "calificacionJuridica": [
    "En ese sentido, tenemos que el hecho...",
    "1. El delito de...",
    "1.1. Ahora bien, entrando...",
    "1.2. En su construcción...",
    "● Verbo rector: ...",
    "● Bien jurídico protegido: ...",
    "● Sujeto activo: ...",
    "● Sujeto pasivo: ..."
  ],
  "elementosConviccion": ["Elemento argumentado 1...", "Elemento argumentado 2..."],
  "analisisYConclusion": ["Análisis de subsunción extenso...", "Conclusión final..."]
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
                hechosDenunciados: [textoCrudo],
                calificacionJuridica: [textoCrudo],
                elementosConviccion: [""], analisisYConclusion: [""]
            };
        }

        const limpiarValor = (valor, porDefecto) => {
            if (!valor || valor === "undefined" || valor === "null" || String(valor).trim() === "") return porDefecto;
            return valor;
        };

        // Forzar a Arrays por si la IA se olvida
        const arrayHechos = Array.isArray(datos.hechosDenunciados) ? datos.hechosDenunciados : [datos.hechosDenunciados];
        const arrayCalificacion = Array.isArray(datos.calificacionJuridica) ? datos.calificacionJuridica : [datos.calificacionJuridica];
        const arrayElementos = Array.isArray(datos.elementosConviccion) ? datos.elementosConviccion : [datos.elementosConviccion];
        const arrayAnalisis = Array.isArray(datos.analisisYConclusion) ? datos.analisisYConclusion : [datos.analisisYConclusion];

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
                tabStops: [{ type: TabStopType.LEFT, position: 2200 }], 
                spacing: { after: 0, line: 240 },
                alignment: AlignmentType.LEFT,
                indent: { left: 567 } 
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

        const crearParrafoSubnumerado = (numero, texto, incluirFootnote = false) => {
            const textRuns = [
                new TextRun({ text: `${numero}\t`, font: "Arial", size: 22 }),
                new TextRun({ text: texto, font: "Arial", size: 22 })
            ];
            if (incluirFootnote) textRuns.push(new FootnoteReferenceRun(1));

            return new Paragraph({
                children: textRuns,
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 120, line: 276 },
                tabStops: [{ type: TabStopType.LEFT, position: 1440 }], 
                indent: { left: 1440, hanging: 720 } 
            });
        };

        const crearParrafoVineta = (texto) => {
            let titulo = texto;
            let resto = "";
            let indiceDosPuntos = texto.indexOf(":");
            if (indiceDosPuntos !== -1) {
                titulo = texto.substring(0, indiceDosPuntos + 1);
                resto = texto.substring(indiceDosPuntos + 1);
            }
            return new Paragraph({
                children: [
                    new TextRun({ text: "●\t", font: "Arial", size: 22 }),
                    new TextRun({ text: titulo, bold: true, font: "Arial", size: 22 }),
                    new TextRun({ text: resto, font: "Arial", size: 22 })
                ],
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 120, line: 276 },
                tabStops: [{ type: TabStopType.LEFT, position: 2880 }], 
                indent: { left: 2880, hanging: 360 } 
            });
        };

        const procesarCalificacionJuridica = (arregloTextos, seccionRomana) => {
            return arregloTextos.map(texto => {
                texto = texto.trim();
                if (texto.match(/^\d+\.\s/)) {
                    let parts = texto.split(" ");
                    let num = parts[0]; 
                    let contenido = parts.slice(1).join(" ");
                    return crearParrafoSubnumerado(`${seccionRomana}.${num}`, contenido);
                } 
                else if (texto.match(/^\d+\.\d+\.\s/)) {
                    let parts = texto.split(" ");
                    let num = parts[0]; 
                    let contenido = parts.slice(1).join(" ");
                    return new Paragraph({
                        children: [
                            new TextRun({ text: `${seccionRomana}.${num}\t`, font: "Arial", size: 22 }),
                            new TextRun({ text: contenido, font: "Arial", size: 22 })
                        ],
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 120, line: 276 },
                        tabStops: [{ type: TabStopType.LEFT, position: 2160 }],
                        indent: { left: 2160, hanging: 720 } 
                    });
                } 
                else if (texto.startsWith("●")) {
                    let contenido = texto.substring(1).trim();
                    return crearParrafoVineta(contenido);
                } 
                else {
                    return crearParrafo(texto);
                }
            });
        };

        const procesarTextoMultilinea = (arregloTextos) => {
            return arregloTextos.map(t => crearParrafo(String(t).trim()));
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
            footnotes: {
                1: {
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({ text: " Sánchez Velarde Pablo. El Nuevo Procesal Penal, Editorial Idemsa, Lima-Perú, abril 2009, pág. 73.", font: "Arial", size: 16 })
                            ],
                            alignment: AlignmentType.JUSTIFIED,
                        }),
                    ],
                },
            },
            sections: [{
                properties: {
                    page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } 
                },
                children: [
                    tablaEncabezado,
                    new Paragraph({ spacing: { before: 500, after: 300 } }),
                    
                    new Paragraph({
                        children: [new TextRun({ text: tipoDocumento.toUpperCase(), bold: true, font: "Arial", size: 28 })],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 300 }
                    }),

                    new Paragraph({
                        children: [new TextRun({ text: `DISPOSICIÓN N.° ${limpiarValor(datos.nroDisposicion, "00")}`, bold: true, underline: {}, font: "Arial", size: 24 })],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 50 } 
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: limpiarValor(datos.fechaL1, "Lima, a la fecha"), font: "Arial", size: 24 })],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0 } 
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: limpiarValor(datos.fechaL2, "de su emisión"), font: "Arial", size: 24 })],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 400 } 
                    }),

                    // I. DADO CUENTA 
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
                    crearParrafoSubnumerado("II.1.", "El Ministerio Público es el organismo autónomo del Estado que tiene como funciones principales la defensa de la legalidad, los derechos ciudadanos y los intereses públicos, la representación de la sociedad en juicio; así como, la persecución del delito y la reparación civil, y las demás que le señalan la Constitución Política del Perú y el ordenamiento jurídico de la Nación."),
                    crearParrafoSubnumerado("II.2.", "Conforme al Art. 14 de su Ley Orgánica y el numeral 2) del Art. IV del Título Preliminar del Código Procesal Penal vigente, el Ministerio Público está obligado, durante el desarrollo de las diligencias de investigación, a actuar bajo el principio de objetividad."),
                    crearParrafoSubnumerado("II.3.", "Entendida como “(…) La objetividad de su función plasmada en muchos casos en sus propias decisiones debe ser principio rector para decidir el inicio de una investigación preliminar o preparatoria, o decidir las diligencias necesarias o recopilación de elementos probatorios para alcanzar los fines del proceso y, principalmente, para formular requerimiento acusatorio. No se trata de lo que diga el texto de la denuncia de parte, sino de lo que se evidencia de su contenido o de los que aparezca de las primeras diligencias de investigación (…)”", true),

                    // III. HECHOS DENUNCIADOS E INVESTIGADOS
                    crearTituloRomano("III", "HECHOS DENUNCIADOS E INVESTIGADOS"),
                    ...arrayHechos.map((hecho, index) => crearParrafoSubnumerado(`III.${index + 1}.`, hecho)),

                    // IV. CALIFICACIÓN JURÍDICO-PENAL
                    crearTituloRomano("IV", "CALIFICACIÓN JURÍDICO-PENAL DE LOS HECHOS DENUNCIADOS"),
                    ...procesarCalificacionJuridica(arrayCalificacion, "IV"),

                    // V. ELEMENTOS DE CONVICCIÓN
                    crearTituloRomano("V", "ELEMENTOS DE CONVICCIÓN"),
                    ...arrayElementos.map((elem, index) => crearParrafoSubnumerado(`V.${index + 1}.`, elem)),

                    // VI. PRONUNCIAMIENTO
                    crearTituloRomano("VI", "PRONUNCIAMIENTO DE ESTE DESPACHO PROVINCIAL"),
                    ...arrayAnalisis.map((analisis, index) => crearParrafoSubnumerado(`VI.${index + 1}.`, analisis)),
                ],
            }],
        });

        const buffer = await Packer.toBuffer(doc);
        res.setHeader('Content-Disposition', 'attachment; filename=Proyecto_Fiscal.docx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
        console.log(`[Ruta 5] ✅ Documento Word optimizado con Análisis Jurídico generado exitosamente.`);

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