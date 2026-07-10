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
app.post('/api/analizar-caso', upload.array('documentosPdf', 20), async (req, res) => {
    // Verificamos el array de archivos (req.files en plural)
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No se recibieron tomos del expediente.' });
    }

    console.log(`\n[Servidor] Procesando ${req.files.length} tomos recibidos...`);
    
    const archivosSubidosGemini = []; // Aquí guardaremos las referencias en la nube

    try {
        // 1. Bucle para subir cada tomo a la API de Gemini uno por uno
        for (const file of req.files) {
            console.log(`   -> Subiendo a la IA: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
            const uploadResult = await fileManager.uploadFile(file.path, {
                mimeType: file.mimetype,
                displayName: file.originalname,
            });
            archivosSubidosGemini.push(uploadResult);
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            generationConfig: { responseMimeType: "application/json" } 
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
1. CITACIÓN EXACTA: Cada dato fáctico, indicio, conclusión o argumento DEBE incluir obligatoriamente el tomo y la página. Ejemplo: '...desbalance patrimonial (Tomo 2, Pág. 34)'. Si no es visible, usa '(Pág. No especificada)'.
2. FORMATO SEGURO: Queda TERMINANTEMENTE PROHIBIDO usar comillas dobles (") dentro de los textos de tus respuestas. Usa solo comillas simples (').
3. TEXTO PLANO CONTINUO: Queda ESTRICTAMENTE PROHIBIDO usar saltos de línea (Enters) o formato Markdown dentro de tus respuestas.
`;

        // 2. Preparamos la matriz de contenido: El prompt + TODOS los tomos
        const contenidoPrompt = [systemPrompt];
        for (const archivoNube of archivosSubidosGemini) {
            contenidoPrompt.push({
                fileData: { fileUri: archivoNube.file.uri, mimeType: archivoNube.file.mimeType }
            });
        }

        console.log('[Servidor] Iniciando lectura y cruce de información entre tomos (Generando JSON)...');
        const result = await model.generateContent(contenidoPrompt);

        let textoJson = result.response.text();
        textoJson = textoJson.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        textoJson = textoJson.replace(/[\n\r\t]+/g, ' '); 

        let resultadoEstructurado;
        try {
            resultadoEstructurado = JSON.parse(textoJson);
        } catch (parseError) {
            console.error('\n[ALERTA] La IA generó un JSON mal formado. Texto crudo:');
            console.error(textoJson);
            throw new Error('Formato JSON inválido devuelto por la IA.');
        }

        // 3. Bucle de limpieza en la nube
        for (const archivoNube of archivosSubidosGemini) {
            await fileManager.deleteFile(archivoNube.file.name);
        }
        
        console.log('[Servidor] Análisis completado. Todos los rastros en la nube eliminados.');
        res.json(resultadoEstructurado);

    } catch (error) {
        console.error('\n[Error en Servidor]:', error.message);
        res.status(500).json({ error: 'Hubo un fallo al analizar los volúmenes del expediente.' });
    } finally {
        // 4. Limpieza local obligatoria (pase lo que pase, borramos los PDFs de tu disco duro)
        if (req.files) {
            for (const file of req.files) {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            }
        }
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