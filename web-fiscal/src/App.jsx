import { useState } from 'react'
import './App.css'

function App() {
  const [archivos, setArchivos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)

  const manejarCambioArchivo = (e) => {
    setArchivos(e.target.files)
  }

  const procesarExpediente = async (e) => {
    e.preventDefault()
    if (!archivos || archivos.length === 0) return alert('Por favor, selecciona al menos un tomo en PDF.')

    setCargando(true)
    const formData = new FormData()

    Array.from(archivos).forEach(archivo => {
      formData.append('documentosPdf', archivo)
    })

    try {
      const respuesta = await fetch('https://api-fiscal-backend.onrender.com/api/analizar-caso', {
        method: 'POST',
        body: formData,
      })

      const datos = await respuesta.json()

      if (!respuesta.ok) {
        throw new Error(datos.error || 'Error desconocido en el servidor')
      }

      setResultado(datos)
    } catch (error) {
      console.error(error)
      alert(`Ocurrió un problema: ${error.message}`)
      setResultado(null)
    } finally {
      setCargando(false)
    }
  }
  const exportarAWord = () => {
    if (!resultado) return;

    // Función auxiliar para leer las listas correctamente para Word
    const formatearLista = (datos) => {
      if (Array.isArray(datos)) return datos.map(item => `<li>${item}</li>`).join('');
      if (typeof datos === 'string') return datos.split('\n').filter(i => i.trim()).map(item => `<li>${item.replace(/^- /, '')}</li>`).join('');
      return '<li>No hay datos</li>';
    };

    const elementosHTML = formatearLista(resultado.elementosDeConviccion || resultado.elementosConviccion);
    const diligenciasHTML = formatearLista(resultado.diligenciasFaltantes || resultado.elementosFaltantes);

    // Plantilla HTML que Word entiende perfectamente
    const contenidoHTML = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Proyección Fiscal</title></head>
      <body style="font-family: Arial, sans-serif;">
        <h1 style="text-align: center; color: #1e293b;">Análisis de Caso - Proyección Fiscal</h1>
        <h2>1. Probabilidad de Éxito y Sugerencia</h2>
        <p><strong>Evaluación:</strong> ${resultado.probabilidadExito}</p>
        
        <h2>2. Resumen Fáctico</h2>
        <p>${resultado.resumenCronologico}</p>
        
        <h2>3. Elementos de Convicción Hallados</h2>
        <ul>${elementosHTML}</ul>
        
        <h2>4. Diligencias Faltantes (Plan de Trabajo)</h2>
        <ul>${diligenciasHTML}</ul>
        
        <h2>5. Sustento Jurídico</h2>
        <p>${resultado.sustentoJuridico}</p>
      </body>
      </html>
    `;

    // Truco para descargar el archivo
    const blob = new Blob(['\ufeff', contenidoHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Proyeccion_Fiscal_Analisis.doc';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  return (
    <div className="contenedor-principal">
      <aside className="sidebar">
        <h2>PROYECCION FISCAL</h2>
        <p>DEBORA</p>
        <hr style={{ opacity: 0.2 }} />
        <div style={{ marginTop: '20px' }}>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={manejarCambioArchivo}
          />
          {archivos.length > 0 && (
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#94a3b8' }}>
              {archivos.length} tomo(s) seleccionado(s)
            </p>
          )}
          <button
            className="boton-analizar"
            onClick={procesarExpediente}
            disabled={cargando}
            style={{ width: '100%', marginTop: '20px', opacity: cargando ? 0.7 : 1 }}
          >
            {cargando ? 'Analizando...' : 'Analizar Tomos'}
          </button>
        </div>
      </aside>

      <main className="contenido">
        {resultado ? (
          <div className="tarjeta-resultado">
            
            {/* Cabecera con Botón de Exportar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <h1 style={{ margin: 0, color: '#1e293b' }}>Análisis del Caso</h1>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <span className="badge-probabilidad" style={{ backgroundColor: '#dcfce7', color: '#166534', fontSize: '1rem' }}>
                  Probabilidad: {resultado.probabilidadExito}
                </span>
                <button onClick={exportarAWord} className="boton-exportar">
                  💾 Exportar a Word
                </button>
              </div>
            </div>

            {/* Lógica del Veredicto Automático (Mantenlo igual) */}
            <div className={`banner-veredicto ${
              String(resultado.probabilidadExito).toUpperCase().includes('ALTA') || 
              String(resultado.probabilidadExito).toUpperCase().includes('MEDIA') 
              ? 'banner-formalizar' : 'banner-archivar'
            }`}>
              {String(resultado.probabilidadExito).toUpperCase().includes('ALTA') || 
               String(resultado.probabilidadExito).toUpperCase().includes('MEDIA') 
                ? '⚖️ SUGERENCIA: FORMALIZAR INVESTIGACIÓN PREPARATORIA' 
                : '🗂️ SUGERENCIA: ARCHIVO PRELIMINAR'}
            </div>
            
            <h3>Resumen Fáctico</h3>
            
            {/* Este es el párrafo del resumen que se había borrado */}
            <p style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', lineHeight: '1.7' }}>
              {resultado.resumenCronologico}
            </p>

            {/* Y esta es la Línea de Tiempo Horizontal */}
            <h4 style={{ color: '#475569', marginTop: '35px', marginBottom: '0px' }}>Línea de Tiempo del Caso:</h4>
            <ul className="linea-tiempo">
              {resultado.resumenCronologico
                .split(/\.\s+(?=[A-ZÁÉÍÓÚ])/)
                .map(oracion => oracion.trim())
                .filter(oracion => oracion.length > 20)
                .map((hito, i) => (
                  <li key={i} className="linea-tiempo-item">
                    {hito}{!hito.endsWith('.') && '.'}
                  </li>
                ))
              }
            </ul>

            <h3>Diligencias Faltantes (Plan de Trabajo)</h3>
            <ul className="lista-diligencias">
              {Array.isArray(resultado.diligenciasFaltantes || resultado.elementosFaltantes)
                ? (resultado.diligenciasFaltantes || resultado.elementosFaltantes).map((item, i) => (
                    <li key={i}>
                      <input type="checkbox" className="checkbox-fiscal" id={`check-${i}`} />
                      <label htmlFor={`check-${i}`} style={{ cursor: 'pointer' }}>{item}</label>
                    </li>
                  ))
                : String(resultado.diligenciasFaltantes || resultado.elementosFaltantes || 'No se sugirieron diligencias adicionales.').split('\n').map((item, i) => item.trim() !== '' && item !== 'undefined' ? (
                    <li key={i}>
                      <input type="checkbox" className="checkbox-fiscal" id={`check-${i}`} />
                      <label htmlFor={`check-${i}`} style={{ cursor: 'pointer' }}>{item.replace(/^- /, '')}</label>
                    </li>
                  ) : null)
              }
            </ul>

            <h3>Sustento Jurídico</h3>
            <p style={{ background: '#f1f5f9', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #64748b' }}>
              {resultado.sustentoJuridico}
            </p>
          </div>
        ) : (
          <div className="tarjeta-resultado" style={{ textAlign: 'center', padding: '80px 20px', color: '#64748b' }}>
            <h2>Listo para procesar</h2>
            <p>Sube los tomos del expediente y obtén una proyección estructurada.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
