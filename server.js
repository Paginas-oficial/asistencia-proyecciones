const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
require('dotenv').config();

const app = express();
const puerto = 3000;

app.use(cors());
app.use(express.json());

// Soportar hasta 150MB por archivo
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 150 * 1024 * 1024 } 
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

if (!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

// =================================================================
// RUTA 1: SUBIDA FORZANDO EL FORMATO PDF
// =================================================================
app.post('/api/subir-tomo', upload.single('documentoPdf'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No se recibió el tomo" });
  
      console.log(`-> Subiendo a Gemini: ${file.originalname}`);
      
      // VITAL: Ignoramos al navegador y le decimos a Google que es 100% un PDF
      const uploadResult = await fileManager.uploadFile(file.path, {
        mimeType: "application/pdf", 
        displayName: file.originalname,
      });
  
      fs.unlinkSync(file.path); // Borrar local
  
      res.json({
        mensaje: "Tomo almacenado",
        ticket: {
          fileUri: uploadResult.file.uri,
          mimeType: "application/pdf", // Guardamos el formato forzado
          nombre: file.originalname,
          googleName: uploadResult.file.name 
        }
      });
    } catch (error) {
      console.error("Error al subir el tomo:", error);
      res.status(500).json({ error: "Fallo al subir el archivo." });
    }
});
  
// =================================================================
// RUTA 2: ANÁLISIS CRUZADO (Arquitectura Oficial Gemini 2.5)
// =================================================================
app.post('/api/analizar-tickets', async (req, res) => {
    try {
      const { tickets } = req.body; 
      if (!tickets || tickets.length === 0) {
          return res.status(400).json({ error: "No hay tomos para analizar" });
      }

      // Instrucciones Maestras
      const systemPrompt = `Eres un Asistente Fiscal experto en el Nuevo Código Procesal Penal peruano, especializado en delitos de corrupción de funcionarios. 
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

REGLAS DE ORO:
1. CITACIÓN EXACTA: Cada dato fáctico o indicio DEBE incluir obligatoriamente el tomo y la página.
2. FORMATO: Tu respuesta debe ser un JSON puro, sin bloques de código Markdown.`;
  
      // VITAL: Ahora las instrucciones van dentro de la configuración del modelo, como exige la versión moderna
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt,
        generationConfig: { responseMimeType: "application/json" }
      });
  
      console.log("[Servidor] Verificando estado de los PDFs en la nube de Google...");
      const matrizArchivos = [];

      for (const ticket of tickets) {
        if (!ticket.googleName) throw new Error("Falta el ID del archivo.");

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

        // VITAL: La matriz ahora SOLO contiene archivos, evitando que el modelo confunda texto con PDFs
        matrizArchivos.push({
          fileData: { 
            fileUri: ticket.fileUri, 
            mimeType: "application/pdf" 
          }
        });
      }

      console.log("[Servidor] Todos los tomos están listos. Iniciando lectura cruzada...");
      
      const result = await model.generateContent(matrizArchivos);
      const text = result.response.text();

      console.log("[Servidor] Borrando expedientes de los servidores de Google por confidencialidad...");
      for (const ticket of tickets) {
        try {
          await fileManager.deleteFile(ticket.googleName);
          console.log(` - Borrado exitoso: ${ticket.nombre}`);
        } catch (errorBorrado) {
          console.error(` - Fallo al borrar ${ticket.nombre}:`, errorBorrado.message);
        }
      }

      res.json(JSON.parse(text));

    } catch (error) {
      console.error("Error en el análisis cruzado:", error);
      res.status(500).json({ error: "Fallo al procesar el caso completo." });
    }
});

const servidorConfigurado = app.listen(puerto, () => {
    console.log(`=================================================`);
    console.log(`Servidor Fiscal Optimizado en http://localhost:${puerto}`);
    console.log(`Listo para recibir tomos grandes y procesar fojas.`);
    console.log(`=================================================`);
});

servidorConfigurado.timeout = 10 * 60 * 1000;