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
        <h2>Fiscal Pro</h2>
        <p>JHONATTAN Y DEBORA</p>
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
        {cargando ? (
          <div className="tarjeta-resultado" style={{ textAlign: 'center', padding: '60px' }}>
            <p>Leyendo el expediente. Esto puede tomar un minuto dependiendo del tamaño del documento...</p>
          </div>
        ) : resultado ? (
          <div className="tarjeta-resultado">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h1>Proyección Fiscal</h1>
              <span
                className="badge-probabilidad"
                style={{
                  backgroundColor: resultado.decision === 'FORMALIZAR' ? '#dcfce7' : '#ffedd5',
                  color: resultado.decision === 'FORMALIZAR' ? '#166534' : '#9a3412',
                }}
              >
                Probabilidad: {resultado.probabilidadExito}
              </span>
            </div>

            <h3>Resumen Fáctico</h3>
            <p>{resultado.resumenCronologico}</p>

            <h3>Sustento Jurídico</h3>
            <p>{resultado.sustentoJuridico}</p>
          </div>
        ) : (
          <div className="tarjeta-resultado" style={{ textAlign: 'center', padding: '60px' }}>
            <p>Selecciona tus archivos y comienza el análisis de caso.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
