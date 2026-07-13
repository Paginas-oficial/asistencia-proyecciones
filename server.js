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
        mimeType: file.mimetype,
        displayName: file.originalname,
      });
  
      // Borramos el PDF del servidor de Render para liberar espacio inmediatamente
      fs.unlinkSync(file.path);
  
      // Devolvemos el "Ticket" de Google Gemini al frontend
      res.json({
        mensaje: "Tomo almacenado",
        ticket: {
          fileUri: uploadResult.file.uri,
          mimeType: uploadResult.file.mimeType,
          nombre: file.originalname
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
  // Le damos 15 segundos a Google para procesar los PDFs pesados
  app.post('/api/analizar-tickets', async (req, res) => {
    try {
      const { tickets } = req.body; // Recibimos la lista de tickets que nos manda la web
      
      if (!tickets || tickets.length === 0) {
          return res.status(400).json({ error: "No hay tomos para analizar" });
      }
  
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash", // <-- El modelo oficial y liberado para tu API Key
        generationConfig: { responseMimeType: "application/json" }
      });
  
      // PEGA AQUÍ TU PROMPT MAESTRO EXACTAMENTE COMO LO TENÍAS
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
1. CITACIÓN EXACTA: Cada dato fáctico, indicio, conclusión o argumento DEBE incluir obligatoriamente el tomo y la página. Ejemplo: '...desbalance patrimonial (Tomo 2, Pág. 34)'. Si no es visible, usa '(Pág. No especificada)'.
2. FORMATO SEGURO: Queda TERMINANTEMENTE PROHIBIDO usar comillas dobles (") dentro de los textos de tus respuestas. Usa solo comillas simples (').
3. TEXTO PLANO CONTINUO: Queda ESTRICTAMENTE PROHIBIDO usar saltos de línea (Enters) o formato Markdown dentro de tus respuestas.
`;
  
      // Preparamos la matriz combinando el prompt con todos los tickets
      // 2. Preparamos la matriz combinando el prompt con todos los tickets
    const contenidoPrompt = [systemPrompt];
    for (const ticket of tickets) {
      contenidoPrompt.push({
        fileData: { fileUri: ticket.fileUri, mimeType: ticket.mimeType }
      });
    }

    // =========================================================
    // AQUÍ ES DONDE DEBE IR EL SEGURO DE TIEMPO (DENTRO DE LA RUTA)
    // =========================================================
    console.log("[Servidor] Dando 15 segundos a Google para procesar los PDFs...");
    await new Promise(resolve => setTimeout(resolve, 15000)); 

    console.log("[Servidor] Iniciando lectura cruzada de tomos...");
    const result = await model.generateContent(contenidoPrompt);
    // =========================================================
    
    const text = result.response.text();
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