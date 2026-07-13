 // Para borrar el archivo temporal y no llenar tu servidor
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
require('dotenv').config();

const app = express();
const puerto = 3000;

// Middlewares obligatorios
app.use(cors());
app.use(express.json());

// PUNTO 3: Configuración de Multer ampliada a 150MB para soportar tomos grandes escaneados
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 150 * 1024 * 1024 } 
});

// Inicialización de los servicios de Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// Asegurar que la carpeta 'uploads' exista localmente
if (!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

// Cambiamos upload.single por upload.array permitiendo hasta 20 tomos simultáneos
// =================================================================
// RUTA 1: EL ACUMULADOR (Sube un tomo a la vez y devuelve un Ticket)
// =================================================================
app.post('/api/subir-tomo', upload.single('documentoPdf'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No se recibió el tomo" });
  
      console.log(`-> Subiendo a Gemini: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
      
      // Subimos a la nube de Google
      const uploadResult = await fileManager.uploadFile(file.path, {
        mimeType: "application/pdf",
        displayName: file.originalname,
      });
  
      // Borramos el PDF del servidor de Render para liberar espacio inmediatamente
      fs.unlinkSync(file.path);
  
      // Devolvemos el "Ticket" de Google Gemini al frontend
      // Devolvemos el "Ticket" de Google Gemini al frontend
      res.json({
        mensaje: "Tomo almacenado",
        ticket: {
          fileUri: uploadResult.file.uri,
          mimeType: uploadResult.file.mimeType,
          nombre: file.originalname,
          googleName: uploadResult.file.name // <-- NUEVO: Guardamos el ID interno para poder borrarlo después
        }
      });
    } catch (error) {
      console.error("Error al subir el tomo:", error);
      res.status(500).json({ error: "Fallo al subir el archivo." });
    }
  });
  
 // =================================================================
  // RUTA 2: EL ANALIZADOR (Cruza la información usando los Tickets)
  // =================================================================
  app.post('/api/analizar-tickets', async (req, res) => {
    try {
      const { tickets } = req.body; 
      
      if (!tickets || tickets.length === 0) {
          return res.status(400).json({ error: "No hay tomos para analizar" });
      }
  
      // CORRECCIÓN 1: Eliminamos generationConfig. Esto estaba causando el Error 400 al chocar con los PDFs.
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash" 
      });
  
      const systemPrompt = `
        Eres un Asistente Fiscal experto en el Nuevo Código Procesal Penal peruano, especializado en delitos de corrupción de funcionarios. 
Tu tarea es evaluar los tomos adjuntos en su conjunto y determinar técnicamente si el caso califica para una Disposición de Formalización de la Investigación Preparatoria o para una Disposición de Archivo.

Debes responder ÚNICAMENTE con un objeto JSON válido que tenga EXACTAMENTE esta estructura:
{
  "decision": "FORMALIZAR" o "ARCHIVAR",
  "probabilidadExito": "Alta" o "Media" o "Baja",
  "resumenCronologico": "Resumen detallado de los hechos fácticos",
  "analisisTipicidad": "Evaluación de la tipicidad objetiva y subjetiva",
  "elementosConviccionEncontrados": ["indicio 1", "indicio 2"],
  "elementosFaltantes": ["diligencia 1", "diligencia 2"],
  "sustentoJuridico": "Explicación legal dogmática y jurisprudencial"
}

REGLAS DE ORO DE OBLIGATORIO CUMPLIMIENTO:
1. CITACIÓN EXACTA: Cada dato fáctico, indicio, conclusión o argumento DEBE incluir obligatoriamente el tomo y la página.
2. FORMATO SEGURO: Usa solo comillas simples (') dentro de los textos.
3. INICIO Y FIN: Tu respuesta debe empezar con la llave { y terminar con }, sin usar formatos Markdown.
`;
  
    // =========================================================
    // SEGURO INTELIGENTE (No tocar)
    // =========================================================
    console.log("[Servidor] Verificando estado de los PDFs en la nube de Google...");
    for (const ticket of tickets) {
      if (ticket.googleName) {
        let archivoListo = false;
        let intentos = 0;
        while (!archivoListo && intentos < 20) { 
          const fileInfo = await fileManager.getFile(ticket.googleName);
          if (fileInfo.state === "ACTIVE") {
            console.log(` - ✅ ${ticket.nombre} procesado y listo.`);
            archivoListo = true;
          } else if (fileInfo.state === "FAILED") {
            throw new Error(`Google falló al leer el PDF: ${ticket.nombre}`);
          } else {
            console.log(` - ⏳ ${ticket.nombre} procesándose... esperando 5s.`);
            await new Promise(r => setTimeout(r, 5000));
            intentos++;
          }
        }
      }
    }

    console.log("[Servidor] Todos los tomos están listos. Iniciando lectura cruzada...");

    // CORRECCIÓN 2: Construcción blindada de la matriz para que Google no rechace el Argumento.
    const contenidoPrompt = [];
    contenidoPrompt.push({ text: systemPrompt }); // Se pasa como objeto estructurado, no como texto suelto.

    for (const ticket of tickets) {
      if (!ticket.fileUri) throw new Error("Falta la URI del archivo.");
      contenidoPrompt.push({
        fileData: { 
          fileUri: String(ticket.fileUri), 
          mimeType: "application/pdf" // Forzado absoluto a PDF
        }
      });
    }

    const result = await model.generateContent(contenidoPrompt);
    let text = result.response.text();

    // CORRECCIÓN 3: Limpiamos manualmente cualquier basura Markdown que la IA añada para evitar que el JSON se rompa
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    // BORRADO POR CONFIDENCIALIDAD
    console.log("[Servidor] Borrando expedientes de los servidores de Google por confidencialidad...");
    for (const ticket of tickets) {
      if (ticket.googleName) {
        try {
          await fileManager.deleteFile(ticket.googleName);
          console.log(` - Borrado exitoso: ${ticket.nombre}`);
        } catch (errorBorrado) {
          console.error(` - Fallo al borrar ${ticket.nombre}:`, errorBorrado.message);
        }
      }
    }

    res.json(JSON.parse(text));

  } catch (error) {
    console.error("Error en el análisis cruzado:", error);
    res.status(500).json({ error: "Fallo al procesar el caso completo." });
  }
});

// PUNTO 3: Configurar el servidor para escuchar y extender el timeout a 10 minutos
const servidorConfigurado = app.listen(puerto, () => {
    console.log(`=================================================`);
    console.log(`Servidor Fiscal Optimizado en http://localhost:${puerto}`);
    console.log(`Listo para recibir tomos grandes y procesar fojas.`);
    console.log(`=================================================`);
});

servidorConfigurado.timeout = 10 * 60 * 1000; // 10 minutos de tiempo de espera máximo