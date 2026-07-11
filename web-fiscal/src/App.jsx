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
            
            {/* Cabecera */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h1 style={{ margin: 0, color: '#1e293b' }}>Análisis del Caso</h1>
              <span className="badge-probabilidad" style={{ backgroundColor: '#dcfce7', color: '#166534', fontSize: '1rem' }}>
                Probabilidad: {resultado.probabilidadExito}
              </span>
            </div>

            {/* Lógica del Veredicto Automático */}
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
            <p>{resultado.resumenCronologico}</p>
            
            <h3>Elementos de Convicción Hallados</h3>
            <ul>
              {Array.isArray(resultado.elementosDeConviccion || resultado.elementosConviccion) 
                ? (resultado.elementosDeConviccion || resultado.elementosConviccion).map((item, i) => <li key={i} style={{marginBottom: '8px'}}>{item}</li>)
                : String(resultado.elementosDeConviccion || resultado.elementosConviccion || 'No se detectaron elementos. Verifica que el documento contenga esta información.').split('\n').map((item, i) => item.trim() !== '' && item !== 'undefined' ? <li key={i} style={{marginBottom: '8px'}}>{item.replace(/^- /, '')}</li> : null)
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
