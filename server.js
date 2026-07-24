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
// =================================================================
// MOTOR CENTRAL DE GEMINI (VERSIÓN MÁXIMA CAPACIDAD - MAX_TOKENS 8192)
// =================================================================
async function analizarTicketsConGemini(tickets, systemPrompt) {
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

  // 2. Configurar el "Cerebro" (¡AQUÍ ESTÁ LA MAGIA PARA EVITAR MAX_TOKENS!)
  const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", 
      systemInstruction: systemPrompt,
      generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192, // <--- EL TANQUE DE GASOLINA AL MÁXIMO ABSOLUTO
          temperature: 0.1,      // <--- 0.1 LO HACE ESTRICTO, SIN RODEOS NI ALUCINACIONES
      },
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
// =================================================================
// RUTA 2: CEREBRO AUDITOR (INVENTARIO PROBATORIO) - VERSIÓN ALIAS
// =================================================================
app.post('/api/inventario', async (req, res) => {
  try {
      const { tickets } = req.body;
      if (!tickets || tickets.length === 0) return res.status(400).json({ error: "No hay tickets" });

      // 🌟 EL TRUCO MAESTRO: Crear un "Diccionario de Alias"
      // En lugar de hacer que la IA escriba nombres gigantes, le damos alias cortos.
      const diccionarioAlias = {};
      const nombresAlias = [];
      
      tickets.forEach((t, index) => {
          const alias = `Tomo_${index + 1}`;
          diccionarioAlias[alias] = t.nombre; // Guardamos en secreto: { 'Tomo_1': 'C.F 623-2024...' }
          nombresAlias.push(alias);
      });

      const promptAuditor = `
Eres un Fiscal Investigador y Auditor Forense Documental.
Analiza LOS ${tickets.length} ARCHIVOS secuencialmente de inicio a fin. Extrae absolutamente todos los elementos relevantes.

--- METODOLOGÍA DE EXTRACCIÓN ---
1. EXTRAER SÍ O SÍ: Notas Informativas, Memorandos, Resoluciones, Informes, Oficios, Actas y Contratos.
2. IGNORAR (BASURA PROCESAL): DNIs, Correos, Cargos, Carátulas y Escritos de apersonamiento.
3. IGNORAR: Providencias del "2do Despacho de la Primera Fiscalía Provincial Corporativa".

--- REGLAS DE SINTAXIS JSON (¡CRÍTICO!) ---
1. PROHIBIDO usar comillas dobles (") dentro de los textos. Usa simples (').
2. NO uses saltos de línea (Enters) dentro de las descripciones.
3. 'descripcion': MÁXIMO 10 PALABRAS.
4. OBLIGATORIO: Genera el JSON completo hasta cerrar la última llave '}'. No te detengas a medias.

--- REGLA ESTRICTA DE ARCHIVOS (USO DE ALIAS) ---
Para 'tomoOrigen', TIENES PROHIBIDO usar los nombres reales. 
Usa ÚNICAMENTE estos alias cortos exactos: ['${nombresAlias.join("', '")}'].

FORMATO EXIGIDO (JSON VÁLIDO):
ESTÁ ESTRICTAMENTE PROHIBIDO decir "Aquí tienes el JSON" o cualquier otra palabra. 
TU RESPUESTA DEBE EMPEZAR CON '{' Y TERMINAR CON '}'. NO GASTES TOKENS EN NADA MÁS.
{
  "elementosConviccionEncontrados": [
    {
      "tipo": "Nombre corto (Ej. Informe N 070-2023)",
      "descripcion": "Texto breve",
      "tomoOrigen": "Tomo_1",
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
          console.log("[Ruta 2] ✅ JSON procesado perfectamente y sin cortes.");
      } catch (errorParse) {
          console.log("⚠️ ERROR DE SINTAXIS JSON. Aplicando rescate...");
          let rescatado = false;
          let jsonTemp = textoCrudo.substring(0, textoCrudo.lastIndexOf('}') + 1);
          while (jsonTemp.length > 20 && !rescatado) {
              try {
                  datosParsed = JSON.parse(jsonTemp + '] }');
                  rescatado = true;
              } catch (e) {
                  jsonTemp = jsonTemp.substring(0, jsonTemp.lastIndexOf('}'));
              }
          }
          if (!rescatado) datosParsed = { elementosConviccionEncontrados: [] };
      }

      // 🌟 TRADUCCIÓN INVERSA: Le devolvemos el nombre real para el botón azul
      if (datosParsed.elementosConviccionEncontrados && datosParsed.elementosConviccionEncontrados.length > 0) {
          datosParsed.elementosConviccionEncontrados = datosParsed.elementosConviccionEncontrados.map(item => ({
              ...item,
              // Cambiamos mágicamente 'Tomo_1' de vuelta a su nombre larguísimo original
              tomoOrigen: diccionarioAlias[item.tomoOrigen] || item.tomoOrigen 
          }));
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