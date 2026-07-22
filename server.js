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

      const nombresArchivosReales = req.body.tickets.map(t => t.nombre).join("', '");
      
      const systemPrompt = `
Eres un Fiscal Investigador y Auditor Forense Documental experto en delitos de corrupción en Perú.
Tu tarea es realizar un INVENTARIO PROBATORIO ESTRATÉGICO, revisando el archivo foja por foja.

--- METODOLOGÍA DE EXTRACCIÓN (FILTRO DE RELEVANCIA PENAL) ---
1. EXCLUSIÓN DE BASURA PROCESAL (AHORRO DE TOKENS): Para poder analizar el tomo completo, TIENES ESTRICTAMENTE PROHIBIDO extraer documentos de mero trámite. 
   IGNORA Y OMITE POR COMPLETO: 
   - Copias de DNI o documentos de identidad.
   - Constancias de Habilidad (Ej. CAL).
   - Cargos de ingreso, recepción o derivación simples.
   - Correos electrónicos de simple remisión de documentos.
   - Escritos de apersonamiento de abogados.
   - Providencias de mero trámite.
2. CAZA DE EVIDENCIA DURA: Tu radar debe activarse ÚNICAMENTE con documentos que prueben hechos, irregularidades o decisiones. Céntrate exclusivamente en extraer: 
   - Resoluciones (Ministeriales, Directorales, Jefaturales, Supremas).
   - Informes (de Control, Especiales, Técnicos, Legales).
   - Oficios (solo si contienen requerimientos de información o respuestas sustanciales, ignora los de simple "remito adjunto").
   - Actas (Allanamiento, Incautación, Entregas, Reuniones).
   - Contratos, TDRs, Comprobantes de pago y Declaraciones.
3. REGLA CRÍTICA DE ANEXOS: Los ANEXOS relevantes adjuntos a un documento principal DEBEN registrarse como objetos independientes con su propia paginación.

--- MODO AHORRO DE TOKENS (ESTILO TELEGRAMA) ---
- 'resumenCronologico' y 'sustentoJuridico': Máximo 3 oraciones cada uno. Ve directo al grano.
- 'descripcion' (de cada elemento): EXTREMA BREVEDAD. MÁXIMO 10 PALABRAS. Solo indica de qué trata. Elimina formalismos.
- 'tipo': Usa abreviaturas oficiales (Ej. 'Res. Min. N° 650-2016').

--- REGLAS DE PAGINACIÓN ---
- "paginaInicio": Número de página donde comienza.
- "paginaFin": Número de página donde termina.
- Si es de una sola carilla, ambos números deben ser iguales.

--- REGLA ESTRICTA DE ARCHIVOS ---
Para 'tomoOrigen', PROHIBIDO inventar nombres. Los ÚNICOS válidos son: ['${nombresArchivosReales}'].

--- FORMATO DE SALIDA EXIGIDO ---
ÚNICAMENTE JSON válido.
REGLA VITAL: ESTÁ ESTRICTAMENTE PROHIBIDO USAR COMILLAS DOBLES DENTRO DE LOS VALORES DE TEXTO. Usa comillas simples ('ejemplo').

{
  "resumenCronologico": "Resumen ultra corto en 3 oraciones...",
  "sustentoJuridico": "Análisis legal ultra corto...",
  "probabilidadExito": "Alta, Media o Baja",
  "elementosConviccionEncontrados": [
    {
      "tipo": "Nombre exacto y corto (Ej. Oficio N° 123 o Anexo 1: Contrato)",
      "descripcion": "Descripción concisa. Máximo 10 palabras.",
      "tomoOrigen": "Nombre exacto del archivo pdf",
      "paginaInicio": 12,
      "paginaFin": 14
    }
  ],
  "elementosFaltantes": ["Diligencia X"]
}
`;

      const model = genAI.getGenerativeModel({
        model: "gemini-3.5-flash", 
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192, 
          temperature: 0.2, 
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
      let textoCrudo = result.response.text();
      
      // Limpieza básica
      textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();

      let datosParsed;
      
      // =================================================================
      // PROTOCOLO DE RESCATE: EL REPARADOR DE JSON TRUNCADO
      // =================================================================
      try {
          // Intento 1: Parseo normal (si la IA terminó correctamente)
          datosParsed = JSON.parse(textoCrudo);
      } catch (errorParse) {
          console.log("[Servidor] ⚠️ JSON truncado detectado (Límite de tokens alcanzado). Aplicando protocolo de rescate...");
          
          let rescatado = false;
          // Nos ubicamos en la última llave de cierre '}' que haya escrito la IA
          let jsonTemp = textoCrudo.substring(0, textoCrudo.lastIndexOf('}') + 1);

          // Bucle de rescate: retrocede objeto por objeto hasta encontrar un punto estable
          while (jsonTemp.length > 50 && !rescatado) {
              try {
                  // Intentamos "sellar" la estructura JSON de emergencia
                  datosParsed = JSON.parse(jsonTemp + '], "elementosFaltantes": ["Nota del Sistema: El análisis se detuvo aquí por la inmensa cantidad de elementos en el documento. Hay más pruebas no listadas."] }');
                  rescatado = true;
                  console.log("[Servidor] ✅ JSON rescatado con éxito. Se salvaron los datos procesados antes del corte.");
              } catch (e) {
                  // Si sigue roto, cortamos el último objeto incompleto y volvemos a intentar
                  jsonTemp = jsonTemp.substring(0, jsonTemp.lastIndexOf('}'));
              }
          }

          if (!rescatado) {
              // Salvavidas final si la IA devolvió pura basura
              console.error("[Servidor] ❌ Fallo total al rescatar. Enviando respuesta de emergencia.");
              datosParsed = {
                  resumenCronologico: "El análisis se interrumpió abruptamente. El PDF contiene demasiados elementos probatorios simultáneos.",
                  sustentoJuridico: "Intente analizar el PDF en partes más pequeñas.",
                  probabilidadExito: "Indeterminada",
                  elementosConviccionEncontrados: [],
                  elementosFaltantes: ["Error de sobrecarga de memoria"]
              };
          }
      }

      console.log("[Servidor] Borrando expedientes de los servidores de Google...");
      for (const ticket of tickets) {
        try {
          await fileManager.deleteFile(ticket.googleName);
        } catch (errorBorrado) {
          console.error(` - Fallo al borrar:`, errorBorrado.message);
        }
      }

      res.json(datosParsed);

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
        model: "gemini-3.5-flash",
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