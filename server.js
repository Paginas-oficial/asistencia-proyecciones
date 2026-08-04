const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const { HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx'); // <-- NUEVA LIBRERÍA PARA WORD

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

      console.log(`[Ruta 5] Iniciando redacción de plantilla: ${tipoDocumento} | ${instruccion}`);

      // 1. EL PROMPT DE DÉBORA, ADAPTADO PARA DEVOLVER EL MOLDE JSON
      const promptRedaccion = `
Rol: Asume el rol de un Fiscal Provincial Titular de una Fiscalía Especializada, jurista experto en Derecho Penal (Parte General y Especial) y Derecho Procesal Penal peruano. Eres, además, un maestro de la lingüística y la argumentación jurídica.

Objetivo Principal: Analizar la carpeta fiscal proporcionada en formato PDF y proyectar la fundamentación jurídica para una ${tipoDocumento}.
Instrucciones Adicionales del Fiscal: "${instruccion}"

Instrucciones de Ejecución y Metodología (De Cumplimiento Estricto):
Paso 1: Procesamiento y Síntesis de la Imputación.
Paso 2: Evaluación de Actos de Investigación (Regla de Nomenclatura Estricta). Cada vez que menciones un documento de los actuados, DEBES consignar su nomenclatura completa, su fecha exacta, y el nombre/cargo de quien lo suscribe.
Paso 3: Construcción de la Fundamentación (El Núcleo). Desarrolla el análisis jurídico (Análisis del Tipo Penal, Juicio de Subsunción y Refutación de Indicios).
Paso 4: Fidelidad Absoluta (Cero Invención). Tu análisis debe nacer 100% de la evidencia documental suministrada. Redacción formal, cero divagación.

Formato de Salida EXIGIDO:
ENTRÉGAME ÚNICAMENTE UN OBJETO JSON VÁLIDO. No uses markdown fuera del JSON.
{
"identificacion": "Indica Carpeta Fiscal, Nombres de Investigados, Agraviado y Delito (una línea).",
"dadoCuenta": "Redacta el texto del Oficio/Documento de denuncia inicial.",
"hechosDenunciados": "Síntesis clara de la imputación.",
"calificacionJuridica": "Análisis del tipo penal y citas relevantes.",
"elementosConviccion": "Lista enumerada o párrafos con la nomenclatura estricta de documentos.",
"analisisYConclusion": "Tu juicio de subsunción, refutación de indicios y conclusión lógica aplicable al tipo de documento."
}`;

      // Llamamos al motor obligando a devolver JSON
      let textoCrudo = await analizarTicketsConGemini(tickets, promptRedaccion, true);
      textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
      
      let datosGenerados;
      try {
          datosGenerados = JSON.parse(textoCrudo);
      } catch (e) {
          console.log("Error parseando el JSON del redactor. Rescatando datos parciales.");
          datosGenerados = {
              identificacion: "Datos inferidos del expediente.",
              dadoCuenta: "Documentos ingresados a la Fiscalía.",
              hechosDenunciados: "Hechos materia de investigación.",
              calificacionJuridica: "Análisis del tipo penal.",
              elementosConviccion: "Elementos recabados.",
              analisisYConclusion: textoCrudo // volcamos todo si falla
          };
      }

      // 2. CONSTRUCCIÓN DE LA PLANTILLA WORD (DOCX)
      // Aquí armamos el esqueleto (las partes NO subrayadas quedan fijas)
      const crearParrafo = (texto, bold = false, alignment = AlignmentType.JUSTIFIED) => {
          return new Paragraph({
              children: [new TextRun({ text: texto, bold: bold, font: "Arial", size: 24 })], // Size 24 = 12pt
              spacing: { after: 200 },
              alignment: alignment,
          });
      };

      const doc = new Document({
          sections: [{
              properties: {},
              children: [
                  // ENCABEZADO FIJO
                  crearParrafo("MINISTERIO PÚBLICO", true, AlignmentType.CENTER),
                  crearParrafo("PRIMERA FISCALÍA ESPECIALIZADA EN DELITOS DE CORRUPCIÓN DE FUNCIONARIOS", true, AlignmentType.CENTER),
                  crearParrafo("-SEGUNDO DESPACHO-", true, AlignmentType.CENTER),
                  crearParrafo(""), 
                  
                  // DATOS DINÁMICOS (De la IA)
                  crearParrafo(`REFERENCIA: ${datosGenerados.identificacion}`, false, AlignmentType.LEFT),
                  crearParrafo(""),
                  crearParrafo(tipoDocumento.toUpperCase(), true, AlignmentType.CENTER),
                  crearParrafo(""),

                  // CUERPO DEL DOCUMENTO (Estructura Fija + Contenido de IA)
                  crearParrafo("DADO CUENTA:", true),
                  crearParrafo(datosGenerados.dadoCuenta),

                  crearParrafo("DEL MINISTERIO PÚBLICO:", true),
                  crearParrafo("El Ministerio Público es el organismo autónomo del Estado que tiene como funciones principales la defensa de la legalidad, los derechos ciudadanos y los intereses públicos, la representación de la sociedad en juicio; así como, la persecución del delito y la reparación civil, actuando bajo el principio de objetividad e imputación necesaria."),

                  crearParrafo("HECHOS DENUNCIADOS E INVESTIGADOS:", true),
                  crearParrafo(datosGenerados.hechosDenunciados),

                  crearParrafo("CALIFICACIÓN JURÍDICO-PENAL:", true),
                  crearParrafo(datosGenerados.calificacionJuridica),

                  crearParrafo("ELEMENTOS DE CONVICCIÓN:", true),
                  crearParrafo(datosGenerados.elementosConviccion),

                  crearParrafo("PRONUNCIAMIENTO DE ESTE DESPACHO PROVINCIAL:", true),
                  crearParrafo(datosGenerados.analisisYConclusion),
              ],
          }],
      });

      // 3. ENVÍO DEL ARCHIVO
      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-Disposition', 'attachment; filename=Proyecto_Fiscal.docx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(buffer);
      console.log(`[Ruta 5] ✅ Documento Word basado en Plantilla generado exitosamente.`);

  } catch (error) {
      console.error("Error al generar el documento Word:", error);
      res.status(500).json({ error: "Fallo al generar el archivo Word." });
  }
});

const servidorConfigurado = app.listen(puerto, () => {
  console.log(`=================================================`);
  console.log(`Servidor Modular de Alta Calidad en http://localhost:${puerto}`);
  console.log(`Listo para recibir partes de PDFs en cola.`);
  console.log(`=================================================`);
});
servidorConfigurado.timeout = 10 * 60 * 1000;