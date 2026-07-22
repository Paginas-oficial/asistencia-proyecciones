const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');              
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
// RUTA 1: SUBIDA FORZANDO EL FORMATO PDF
// =================================================================
app.post('/api/subir-tomo', upload.single('documentoPdf'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No se recibió el tomo" });
  
      console.log(`-> Subiendo a Gemini: ${file.originalname}`);
      
      const uploadResult = await fileManager.uploadFile(file.path, {
        mimeType: "application/pdf", 
        displayName: file.originalname,
      });
  
      fs.unlinkSync(file.path); 
  
      res.json({
        mensaje: "Tomo almacenado",
        ticket: {
          fileUri: uploadResult.file.uri,
          mimeType: "application/pdf", 
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

      // 1. Prompt corregido (eliminado el doble const)
      const systemPrompt = `
      Eres un fiscal experto de Perú. Analiza el texto extraído de la Carpeta Fiscal.
      Busca estrictamente cualquier documento que encaje en estas categorías:
      1. Base: Denuncias, Informes de Control, Relación de implicados.
      2. Resoluciones: Ministeriales, Directorales, Jefaturales, Administrativas, Decretos.
      3. Comunicaciones: Notas Informativas, Memorandos, Oficios, Hojas de envío.
      4. Logística/SEACE: Contratos, TDR, Créditos Presupuestarios, Actas de Conformidad, Reportes SEACE.
      5. Gestión Institucional: MOF, ROF, Opiniones Técnicas/Legales.
      6. Penales: Declaraciones, Pericias, Actas de Allanamiento.
      
      Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON válido, sin formato Markdown, con esta estructura exacta:
      {
        "resumenCronologico": "Historia de los hechos...",
        "sustentoJuridico": "Análisis legal...",
        "probabilidadExito": "Alta, Media o Baja",
        "elementosConviccionEncontrados": [
          {
            "tipo": "Nombre del documento (ej. Nota Informativa N° 097-2019)",
            "descripcion": "Resumen de lo que dice y su relevancia penal",
            "tomoOrigen": "Nombre exacto del archivo pdf de donde lo sacaste",
            "paginaExactaPDF": 45
          }
        ],
        "elementosFaltantes": ["Diligencia 1", "Diligencia 2"]
      }
      `;

      // 2. Modelo configurado con blindaje para JSON
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: "application/json" // OBLIGA a devolver JSON puro
        }
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
      
      const result = await model.generateContent(partes);
      let text = result.response.text();

      // Limpiamos manualmente posibles residuos por si acaso
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

      const uploadResult = await fileManager.uploadFile(file.path, {
          mimeType: file.mimetype, 
          displayName: file.originalname,
      });

      fs.unlinkSync(file.path); 

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

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt
      });

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

      const result = await model.generateContent([
          { fileData: { fileUri: uploadResult.file.uri, mimeType: uploadResult.file.mimeType } },
          { text: instruccion }
      ]);

      const textoExtraido = result.response.text();

      try {
          await fileManager.deleteFile(uploadResult.file.name);
          console.log(`-> [OCR] Borrado exitoso y transcripción terminada.`);
      } catch (e) {
          console.error("Error borrando archivo:", e);
      }

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

servidorConfigurado.timeout = 10 * 60 * 1000;