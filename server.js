const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const { HarmCategory, HarmBlockThreshold } = require('@google/generative-ai'); // <-- AGREGAR ESTA LÍNEA
const { GoogleAIFileManager } = require("@google/generative-ai/server");

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
async function analizarTicketsConGemini(tickets, systemPrompt) {
    console.log(`\n[Motor] Verificando ${tickets.length} partes en la nube de Google...`);
    
    // 1. Esperar a que TODAS las partes estén procesadas
    for (const ticket of tickets) {
        if (!ticket.googleName) throw new Error("Falta el ID del archivo.");
        let archivoListo = false;
        let intentos = 0;
        while (!archivoListo && intentos < 20) { 
            const fileInfo = await fileManager.getFile(ticket.googleName);
            if (fileInfo.state === "ACTIVE") {
                console.log(` - ✅ ${ticket.nombre} listo.`);
                archivoListo = true;
            } else if (fileInfo.state === "FAILED") {
                throw new Error(`Google falló al leer el PDF: ${ticket.nombre}`);
            } else {
                await new Promise(r => setTimeout(r, 5000));
                intentos++;
            }
        }
    }

    // 2. Configurar el "Cerebro" (Modelo y Prompt)
    // 2. Configurar el "Cerebro" (Modelo, Prompt y Apagar Filtros)
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash", 
      systemInstruction: systemPrompt,
      generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192, 
          temperature: 0.2, 
      },
      safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
  });

    // 3. Armar la lista de archivos para inyectarlos en orden
    // 3. Armar la lista de archivos para inyectarlos en orden
    const fileParts = tickets.map(t => ({
      fileData: { fileUri: t.fileUri, mimeType: "application/pdf" }
  }));

  console.log("[Motor] Iniciando lectura cruzada de las partes...");
  const result = await model.generateContent(fileParts);
  
  // 🚨 NUEVO DIAGNÓSTICO: Saber por qué se detuvo la IA
  const razon = result.response.candidates[0]?.finishReason;
  console.log(`[Motor] La IA terminó de escribir por: ${razon}`);
  
  const textoCrudo = result.response.text();

  // 4. Limpieza automática de la nube
  for (const ticket of tickets) {
      try { await fileManager.deleteFile(ticket.googleName); } 
      catch (e) { console.error(` - Fallo al borrar:`, e.message); }
  }

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

        let textoCrudo = await analizarTicketsConGemini(tickets, promptResumen);
        textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
        res.json(JSON.parse(textoCrudo));

    } catch (error) {
        console.error("Error en Ruta Resumen:", error);
        res.status(500).json({ error: "Fallo al generar el resumen." });
    }
});

// =================================================================
// RUTA 2: CEREBRO AUDITOR (INVENTARIO PROBATORIO)
// =================================================================
// =================================================================
// RUTA 2: CEREBRO AUDITOR (INVENTARIO PROBATORIO)
// =================================================================
// =================================================================
// RUTA 2: CEREBRO AUDITOR (INVENTARIO PROBATORIO)
// =================================================================
app.post('/api/inventario', async (req, res) => {
  try {
      const { tickets } = req.body;
      if (!tickets || tickets.length === 0) return res.status(400).json({ error: "No hay tickets" });

      const nombresArchivos = tickets.map(t => t.nombre).join("', '");

      const promptAuditor = `
Eres un Fiscal Investigador y Auditor Forense Documental experto en delitos de corrupción en Perú.

--- ALERTA DE MULTI-ARCHIVOS (¡IMPORTANTE!) ---
Se han adjuntado ${tickets.length} archivos PDF que conforman un solo expediente.
ES OBLIGATORIO que analices LOS ${tickets.length} ARCHIVOS secuencialmente. Extrae los elementos de TODOS los archivos adjuntos.

--- METODOLOGÍA DE EXTRACCIÓN ---
1. PRIORIDAD MÁXIMA: Extrae TODA: Nota Informativa, Memorando, Resolución, Informes y Oficios.
2. EXCLUSIÓN ESPECÍFICA: PROHIBIDO extraer: DNIs, Correos, Cargos, Carátulas y Escritos de apersonamiento. (Todo el resto, como actas o contratos, SÍ debe ser extraído).
3. REGLA QUIRÚRGICA: Ignora TODAS las Providencias y Disposiciones del "2do Despacho de la Primera Fiscalía Provincial Corporativa".

--- REGLAS DE SINTAXIS JSON Y CÓDIGO (¡DE VIDA O MUERTE!) ---
Para evitar que el sistema colapse, DEBES CUMPLIR ESTO ESTRICTAMENTE:
1. ESTÁ TOTALMENTE PROHIBIDO usar comillas dobles (") dentro de los textos. Si necesitas citar algo, usa comillas simples (').
2. NO uses saltos de línea (Enters) dentro de las descripciones. Escribe todo de corrido.
3. 'descripcion': EXTREMA BREVEDAD. MÁXIMO 10 PALABRAS.
4. Para 'tomoOrigen', los ÚNICOS nombres válidos son: ['${nombresArchivos}'].

FORMATO DE SALIDA EXIGIDO (ÚNICAMENTE JSON válido):
{
"elementosConviccionEncontrados": [
  {
    "tipo": "Nombre exacto y corto",
    "descripcion": "Descripción sin comillas dobles y maximo 10 palabras.",
    "tomoOrigen": "Nombre exacto de la parte",
    "paginaInicio": 12,
    "paginaFin": 14
  }
]
}`;

      let textoCrudo = await analizarTicketsConGemini(tickets, promptAuditor);
      textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
      
      let datosParsed;
      try {
          datosParsed = JSON.parse(textoCrudo);
          console.log("[Ruta 2] ✅ JSON procesado perfectamente sin errores de sintaxis.");
      } catch (errorParse) {
          // 🚨 SI SE ROMPE, AHORA VEREMOS EXACTAMENTE QUÉ ESCRIBIÓ LA IA
          console.log("=================================================");
          console.log("⚠️ ERROR FATAL DE SINTAXIS JSON DETECTADO.");
          console.log("El texto crudo que envió la IA fue:");
          console.log(textoCrudo); 
          console.log("=================================================");
          
          console.log("Aplicando protocolo de rescate...");
          let rescatado = false;
          let jsonTemp = textoCrudo.substring(0, textoCrudo.lastIndexOf('}') + 1);
          while (jsonTemp.length > 50 && !rescatado) {
              try {
                  datosParsed = JSON.parse(jsonTemp + '] }');
                  rescatado = true;
              } catch (e) {
                  jsonTemp = jsonTemp.substring(0, jsonTemp.lastIndexOf('}'));
              }
          }
          if (!rescatado) datosParsed = { elementosConviccionEncontrados: [] };
      }
      res.json(datosParsed);

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

const servidorConfigurado = app.listen(puerto, () => {
    console.log(`=================================================`);
    console.log(`Servidor Modular de Alta Calidad en http://localhost:${puerto}`);
    console.log(`Listo para recibir partes de PDFs en cola.`);
    console.log(`=================================================`);
});
servidorConfigurado.timeout = 10 * 60 * 1000;