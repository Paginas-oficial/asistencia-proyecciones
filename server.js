const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');              
const { GoogleAIFileManager } = require("@google/generative-ai/server");

require('dotenv').config();

const app = express();
// Pequeña mejora para Render: usar el puerto que ellos asignen o el 3000
app.use(cors());
const puerto = process.env.PORT || 3000; 

app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ limit: '150mb', extended: true }));

// Soportar hasta 150MB por archivo

// Volvemos al almacenamiento directo en la memoria RAM (Más rápido, pero ten cuidado con archivos gigantes)
// Usamos almacenamiento en disco para que Gemini pueda leer la ruta del archivo
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Render permite escribir en la carpeta temporal /tmp
    cb(null, '/tmp') 
  },
  filename: function (req, file, cb) {
    // Le agregamos la fecha para que no se sobreescriban archivos con el mismo nombre
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 150 * 1024 * 1024 } // Límite de 150 MB
});
// Inicializamos a Google UNA SOLA VEZ
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
// RUTA 2: EL ANALIZADOR (Cruza la información usando los Tickets)
// =================================================================
app.post('/api/analizar-tickets', async (req, res) => {
    try {
      const { tickets } = req.body; 
      if (!tickets || tickets.length === 0) {
          return res.status(400).json({ error: "No hay tomos para analizar" });
      }

      // 1. El Prompt Maestro exacto que funcionaba en tu prueba local (MOVIDO ARRIBA)
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
2. FORMATO: Tu respuesta debe ser un JSON puro, usa solo comillas simples (') dentro de los textos.`;

      // 2. Configuramos el modelo de manera limpia (DESPUÉS DEL PROMPT)
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash", // Asegúrate de que el modelo sea el correcto (gemini-1.5-flash o gemini-2.5-flash)
        systemInstruction: systemPrompt
      });

      console.log("[Servidor] Verificando estado de los PDFs en la nube...");
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
      }

      // 3. EL GRAN FIX: Colocamos el TEXTO y los ARCHIVOS en LA MISMA matriz obligatoriamente
      const partes = [ systemPrompt ]; 

      for (const ticket of tickets) {
        partes.push({
          fileData: { 
            fileUri: ticket.fileUri, 
            mimeType: "application/pdf" 
          }
        });
      }

      console.log("[Servidor] Todos los tomos están listos. Iniciando lectura cruzada...");
      
      // Ahora la IA recibe las instrucciones claras + los archivos, evitando el Error 400
      const result = await model.generateContent(partes);
      let text = result.response.text();

      // 4. Limpiamos manualmente posibles residuos de código que rompan el JSON
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();

      console.log("[Servidor] Borrando expedientes de los servidores de Google...");
      for (const ticket of tickets) {
        try {
          await fileManager.deleteFile(ticket.googleName);
        } catch (errorBorrado) {
          console.error(` - Fallo al borrar:`, errorBorrado.message);
        }
      }

      res.json(JSON.parse(text));

    } catch (error) {
      console.error("Error en el análisis cruzado:", error);
      res.status(500).json({ error: "Fallo al procesar el caso completo." });
    }
});

// =================================================================
// RUTA 3: EXTRACTOR LITERAL (El Digitalizador OCR del Usuario)
// =================================================================
app.post('/api/transcribir-fojas', upload.single('documento'), async (req, res) => {
  try {
      const file = req.file;
      const { instruccion } = req.body; 

      if (!file || !instruccion) {
          return res.status(400).json({ error: "Faltan datos (archivo o instrucción)" });
      }

      console.log(`-> [OCR] Iniciando Transcripción para: ${file.originalname}`);
      console.log(`-> [OCR] Orden: "${instruccion}"`);

      // 1. Subir el archivo al gestor de Google
      const uploadResult = await fileManager.uploadFile(file.path, {
          mimeType: file.mimetype, // Permite PDFs o Imágenes sueltas
          displayName: file.originalname,
      });

      fs.unlinkSync(file.path); // Borrar el archivo temporal del servidor

      // 2. Tu Prompt Maestro de Ingeniería
      const systemPrompt = `Rol: Actúa como un Asistente de Digitalización y Transcripción Documental. Tu única función es procesar los archivos PDF o imágenes escaneadas que te proporciono y convertirlos en texto plano con precisión absoluta.
Objetivo Principal: Transcribir exacta y literalmente el contenido de los documentos según mis instrucciones específicas, entregando un texto limpio, sin formato, listo para ser copiado y pegado en Microsoft Word.

Instrucciones de Interacción (Cómo Entender mis Pedidos):
- Si digo: "Transcribe el [NOMBRE DEL DOCUMENTO]". Tu Acción: Transcribes el documento completo.
- Si digo: "Transcribe la página [NÚMERO]". Tu Acción: Transcribes todo el texto de esa página, según el contador de páginas del visor de PDF.
- Si digo: "Transcribe el folio [NÚMERO]" o "Transcribe de fojas [X] a [Y]". Tu Acción: Buscas el número de folio impreso o sellado en la página y transcribes el texto de esa(s) página(s) específica(s).

Reglas Estrictas de Transcripción:
1. Salida Exclusiva de Texto: Tu respuesta debe contener única y exclusivamente la transcripción solicitada. No incluyas saludos, confirmaciones, ni despedidas. Solo el texto.
2. Transcripción Literal (Verbatim): Transcribe el texto exactamente como aparece, incluyendo mayúsculas, minúsculas, puntuación, acentos y errores ortográficos del original.
3. Manejo de Texto Ilegible: Si una palabra o sección es absolutamente ilegible, inserta la etiqueta: [texto ilegible].
4. Manejo de Texto Manuscrito: Si encuentras texto manuscrito (notas, firmas), intenta transcribirlo. Si es ilegible, inserta: [manuscrito ilegible].
5. Formato Limpio para Word:
 - Sin Formato: Elimina negritas, cursivas, tamaños de letra.
 - Párrafos: Conserva los saltos de párrafo.
 - Columnas: Transcribe la columna izquierda completa primero, y luego la derecha.
 - Ignorar Ruido: Ignora encabezados, pies de página y elementos gráficos.
 - Tablas: Transcribe el contenido celda por celda, fila por fila. Usa un punto y coma (;) para separar celdas.`;

      // Configuramos el modelo sin forzar JSON, porque queremos Texto Puro
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt
    });

      // 3. Seguro de Procesamiento (Esperar a Google)
      let archivoListo = false;
      let intentos = 0;
      while (!archivoListo && intentos < 20) {
          const fileInfo = await fileManager.getFile(uploadResult.file.name);
          if (fileInfo.state === "ACTIVE") {
              archivoListo = true;
          } else if (fileInfo.state === "FAILED") {
              throw new Error("Fallo al procesar el archivo en Google.");
          } else {
              await new Promise(r => setTimeout(r, 5000));
              intentos++;
          }
      }

      // 4. Ejecutamos la orden enviando el Archivo + La Instrucción del Usuario
      const result = await model.generateContent([
          { fileData: { fileUri: uploadResult.file.uri, mimeType: uploadResult.file.mimeType } },
          { text: instruccion }
      ]);

      const textoExtraido = result.response.text();

      // 5. Borrado de Confidencialidad
      try {
          await fileManager.deleteFile(uploadResult.file.name);
          console.log(`-> [OCR] Borrado exitoso y transcripción terminada.`);
      } catch (e) {
          console.error("Error borrando archivo:", e);
      }

      // Devolvemos el texto limpio al Frontend
      res.json({ texto: textoExtraido });

  } catch (error) {
      console.error("Error en transcripción OCR:", error);
      res.status(500).json({ error: "Fallo al transcribir el documento." });
  }
});

// =================================================================
// INICIO DEL SERVIDOR
// =================================================================
const servidorConfigurado = app.listen(puerto, () => {
    console.log(`=================================================`);
    console.log(`Servidor Fiscal Optimizado en http://localhost:${puerto}`);
    console.log(`Listo para recibir tomos grandes y procesar fojas.`);
    console.log(`=================================================`);
});

// Aumentamos el tiempo de espera por si los PDFs son gigantes
servidorConfigurado.timeout = 10 * 60 * 1000;