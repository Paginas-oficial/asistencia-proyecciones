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
// MOTOR CENTRAL DE PROCESAMIENTO (Sube, Analiza y Limpia)
// =================================================================
async function analizarConGemini(filePath, fileName, systemPrompt) {
    console.log(`\n[Motor] Subiendo a Gemini: ${fileName}`);
    const uploadResult = await fileManager.uploadFile(filePath, {
        mimeType: "application/pdf", 
        displayName: fileName,
    });

    // 1. Esperar a que Google procese el PDF
    let archivoListo = false;
    let intentos = 0;
    while (!archivoListo && intentos < 20) {
        const fileInfo = await fileManager.getFile(uploadResult.file.name);
        if (fileInfo.state === "ACTIVE") {
            console.log(`[Motor] ✅ PDF procesado en la nube. Iniciando IA...`);
            archivoListo = true;
        } else if (fileInfo.state === "FAILED") {
            throw new Error(`Google falló al leer el PDF.`);
        } else {
            await new Promise(r => setTimeout(r, 5000));
            intentos++;
        }
    }

    // 2. Configurar el "Cerebro" (Modelo y Prompt)
    const model = genAI.getGenerativeModel({
        model: "gemini-3.5-flash", 
        systemInstruction: systemPrompt,
        generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192, 
            temperature: 0.2, 
        }
    });

    // 3. Generar la respuesta
    const result = await model.generateContent([
        { fileData: { fileUri: uploadResult.file.uri, mimeType: "application/pdf" } }
    ]);
    
    const textoCrudo = result.response.text();

    // 4. Limpieza automática de la nube
    try {
        await fileManager.deleteFile(uploadResult.file.name);
        console.log(`[Motor] 🗑️ Archivo borrado de la nube de Google.`);
    } catch (e) {
        console.error("Error borrando archivo:", e);
    }

    return textoCrudo;
}

// =================================================================
// RUTA 1: CEREBRO DE RESUMEN Y ANÁLISIS JURÍDICO
// =================================================================
app.post('/api/resumen', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No se recibió el PDF" });

        const promptResumen = `
Eres un Fiscal Superior analizando un caso complejo de corrupción en Perú.
Tu ÚNICA tarea es redactar un Resumen de los Hechos y un Análisis Jurídico.
TOMA TODO EL ESPACIO QUE NECESITES. Escribe con detalle, redacta una historia clara de qué pasó, quiénes están involucrados y cuál es el presunto delito.
No extraigas listas de documentos, solo concéntrate en la narrativa y la estrategia legal.

FORMATO DE SALIDA EXIGIDO (ÚNICAMENTE JSON válido, usa comillas simples para textos internos):
{
  "resumenCronologico": "Redacción detallada de los hechos procesales y delictivos...",
  "sustentoJuridico": "Análisis legal completo...",
  "probabilidadExito": "Alta, Media o Baja"
}`;

        let textoCrudo = await analizarConGemini(req.file.path, req.file.originalname, promptResumen);
        fs.unlinkSync(req.file.path); // Borrar local
        
        textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
        res.json(JSON.parse(textoCrudo));

    } catch (error) {
        console.error("Error en Ruta Resumen:", error);
        res.status(500).json({ error: "Fallo al generar el resumen." });
    }
});

// =================================================================
// RUTA 2: CEREBRO AUDITOR (INVENTARIO PROBATORIO - CERO OMISIONES)
// =================================================================
app.post('/api/inventario', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No se recibió el PDF" });

        const nombreArchivo = req.file.originalname;
        const promptAuditor = `
Eres un Fiscal Investigador y Auditor Forense Documental experto en delitos de corrupción en Perú.
Tu tarea es realizar un INVENTARIO PROBATORIO ESTRATÉGICO, revisando el archivo foja por foja.

--- METODOLOGÍA DE EXTRACCIÓN Y PRIORIDADES ---
1. PRIORIDAD MÁXIMA (LA CARNE DEL CASO): Debes buscar activamente y asegurar la extracción de toda: Nota Informativa, Memorando, Resolución (Ministerial, Directoral, Jefatural, etc.), Informes y Oficios. Estos son el núcleo del caso.
2. EXCLUSIÓN ESPECÍFICA (FILTRO DE BASURA PROCESAL): Tienes ESTRICTAMENTE PROHIBIDO extraer o listar:
   - Copias de DNI o documentos de identidad.
   - Correos electrónicos.
   - Cargos (de ingreso, recepción, derivación o notificación).
   - Carátulas, portadas o páginas separadoras.
   - Escritos de apersonamiento de abogados o partes.
   - REGLA QUIRÚRGICA: Ignora TODAS las Providencias y Disposiciones que provengan o formen parte del "2do Despacho de la Primera Fiscalía Provincial Corporativa Especializada en Delitos de Corrupción de Funcionarios de Lima". 
   (Nota: Todo el RESTO del expediente, como actas, contratos, comprobantes y otras providencias/disposiciones de despachos o instancias DISTINTAS, SÍ deben ser extraídos).
3. DESGLOSE OBLIGATORIO DE ANEXOS (REGLA CRÍTICA): Los ANEXOS adjuntos a un documento principal DEBEN registrarse SIEMPRE como objetos independientes con su propia paginación. 
   - Está PROHIBIDO agrupar un informe u oficio con sus anexos en un solo ítem.
   - Ejemplo: Si un "Oficio N° 05" adjunta un "Contrato de Alquiler", extraes el Oficio como un elemento, y luego el Contrato como OTRO elemento separado.

--- MODO AHORRO DE TOKENS (ESTILO TELEGRAMA) ---
Para que puedas listar cientos de documentos sin quedarte sin memoria:
- 'resumenCronologico' y 'sustentoJuridico': Máximo 3 oraciones cada uno.
- 'descripcion' (de cada elemento): EXTREMA BREVEDAD. MÁXIMO 10 PALABRAS. Solo indica de qué trata. Elimina formalismos de relleno.
- 'tipo': Usa abreviaturas (Ej. 'Res. Min. N° 650-2016', 'Nota Inf. N° 072', 'Memo N° 012', 'Anexo 1: Contrato').

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
      "tipo": "Nombre exacto y corto (Ej. Memo N° 123 o Anexo 1: Contrato)",
      "descripcion": "Descripción concisa. Máximo 10 palabras.",
      "tomoOrigen": "Nombre exacto del archivo pdf",
      "paginaInicio": 12,
      "paginaFin": 14
    }
  ]
}
`;

        let textoCrudo = await analizarConGemini(req.file.path, req.file.originalname, promptAuditor);
        fs.unlinkSync(req.file.path); 
        
        textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
        
        let datosParsed;
        // PROTOCOLO DE RESCATE (Solo para la lista que puede truncarse)
        try {
            datosParsed = JSON.parse(textoCrudo);
        } catch (errorParse) {
            console.log("⚠️ JSON truncado detectado. Aplicando protocolo de rescate...");
            let rescatado = false;
            let jsonTemp = textoCrudo.substring(0, textoCrudo.lastIndexOf('}') + 1);
            while (jsonTemp.length > 50 && !rescatado) {
                try {
                    datosParsed = JSON.parse(jsonTemp + '] }');
                    rescatado = true;
                    console.log("✅ JSON de Inventario rescatado con éxito.");
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
app.post('/api/diligencias', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No se recibió el PDF" });

        const promptEstratega = `
Eres un Fiscal Superior Estratega evaluando un caso de corrupción.
Tu ÚNICA tarea es leer el expediente e identificar QUÉ FALTA.
Detecta vacíos en la investigación, personas mencionadas a las que no se ha interrogado, o documentos financieros, periciales o levantamientos de secreto bancario que la fiscalía debería solicitar para formalizar o fortalecer el caso.

FORMATO DE SALIDA EXIGIDO (ÚNICAMENTE JSON válido, usa comillas simples para textos):
{
  "elementosFaltantes": [
    "Tomar declaración testimonial de X persona...",
    "Solicitar levantamiento del secreto bancario de la empresa Y...",
    "Requerir peritaje contable al informe Z..."
  ]
}`;

        let textoCrudo = await analizarConGemini(req.file.path, req.file.originalname, promptEstratega);
        fs.unlinkSync(req.file.path); 
        
        textoCrudo = textoCrudo.replace(/```json/gi, "").replace(/```/g, "").trim();
        res.json(JSON.parse(textoCrudo));

    } catch (error) {
        console.error("Error en Ruta Diligencias:", error);
        res.status(500).json({ error: "Fallo al evaluar la estrategia." });
    }
});

// =================================================================
// RUTA 4: EXTRACTOR LITERAL (El Digitalizador OCR del Usuario)
// =================================================================
app.post('/api/transcribir-fojas', upload.single('documento'), async (req, res) => {
  try {
      const file = req.file;
      const { instruccion } = req.body; 
      if (!file || !instruccion) return res.status(400).json({ error: "Faltan datos" });

      const promptOCR = `Rol: Actúa como un Asistente de Digitalización y Transcripción Documental. Tu única función es procesar los archivos PDF o imágenes y convertirlos en texto plano.
Reglas Estrictas: Transcribe literalmente según mis instrucciones: "${instruccion}". Sin saludos. Sin formato. Reemplaza partes ilegibles con [texto ilegible].`;

      let textoCrudo = await analizarConGemini(file.path, file.originalname, promptOCR);
      fs.unlinkSync(file.path);

      res.json({ texto: textoCrudo });

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
    console.log(`Servidor de Agentes Modulares en http://localhost:${puerto}`);
    console.log(`Listo para recibir PDFs en las 4 rutas distintas.`);
    console.log(`=================================================`);
});

// Aumentamos el Timeout a 10 minutos para soportar PDFs gigantes
servidorConfigurado.timeout = 10 * 60 * 1000;