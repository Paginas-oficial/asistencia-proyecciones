import { useState } from 'react'

function App() {
  const [archivo, setArchivo] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)

  const manejarCambioArchivo = (e) => {
    setArchivo(e.target.files[0])
  }

  const procesarExpediente = async (e) => {
    e.preventDefault()
    if (!archivo) return alert('Por favor, selecciona un PDF primero.')

    setCargando(true)
    const formData = new FormData()
    formData.append('documentoPdf', archivo)

    try {
      // Llamamos a tu servidor de Node.js que está en el puerto 3000
      const respuesta = await fetch('http://localhost:3000/api/analizar-caso', {
        method: 'POST',
        body: formData,
      })
      
      const datos = await respuesta.json()
      setResultado(datos)
    } catch (error) {
      console.error(error)
      alert('Hubo un error de conexión con el servidor fiscal.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh', padding: '20px' }}>
      
      {/* Cabecera Personalizada */}
      <header style={{ backgroundColor: '#1e293b', color: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '24px', letterSpacing: '2px' }}>JHONATTAN Y DEBORA</h1>
        <p style={{ margin: '5px 0 0 0', color: '#94a3b8' }}>Asistente de Proyección Legal - Inteligencia Artificial</p>
      </header>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        
        {/* Panel Izquierdo: Subida de Archivos */}
        <div style={{ flex: 1, backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#334155', marginTop: 0 }}>Cargar Expediente (PDF)</h2>
          
          <form onSubmit={procesarExpediente}>
            <div style={{ border: '2px dashed #cbd5e1', padding: '40px 20px', textAlign: 'center', borderRadius: '8px', marginBottom: '20px', backgroundColor: '#f8fafc' }}>
              <input 
                type="file" 
                accept="application/pdf" 
                onChange={manejarCambioArchivo} 
                style={{ marginBottom: '10px' }}
              />
              <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Solo archivos PDF. Se analizará tipicidad y elementos de convicción.</p>
            </div>
            
            <button 
              type="submit" 
              disabled={cargando}
              style={{ 
                width: '100%', padding: '15px', backgroundColor: cargando ? '#94a3b8' : '#2563eb', 
                color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: cargando ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}>
              {cargando ? 'Analizando folios y Código Procesal... ⏳' : 'Analizar para Proyección 🚀'}
            </button>
          </form>
        </div>

        {/* Panel Derecho: Resultados (Split Screen) */}
        <div style={{ flex: 2, backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', minHeight: '400px' }}>
          <h2 style={{ color: '#334155', marginTop: 0 }}>Resultado del Análisis Jurídico</h2>
          
          {!resultado && !cargando && (
            <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '100px' }}>
              <p>Sube un documento para generar el proyecto de disposición.</p>
            </div>
          )}

          {cargando && (
            <div style={{ textAlign: 'center', color: '#2563eb', marginTop: '100px', fontWeight: 'bold' }}>
              <p>Leyendo el expediente. Esto puede tomar un minuto dependiendo del tamaño del tomo...</p>
            </div>
          )}

          {resultado && !cargando && (
            <div>
              <div style={{ 
                backgroundColor: resultado.decision === 'FORMALIZAR' ? '#dcfce7' : '#ffedd5', 
                color: resultado.decision === 'FORMALIZAR' ? '#166534' : '#9a3412',
                padding: '15px', borderRadius: '8px', fontWeight: 'bold', fontSize: '18px', marginBottom: '20px', border: '1px solid',
                borderColor: resultado.decision === 'FORMALIZAR' ? '#bbf7d0' : '#fed7aa'
              }}>
                RECOMENDACIÓN: {resultado.decision} LA INVESTIGACIÓN (Probabilidad: {resultado.probabilidadExito})
              </div>

              <h4 style={{ color: '#475569', borderBottom: '2px solid #e2e8f0', paddingBottom: '5px' }}>Resumen Fáctico</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.6' }}>{resultado.resumenCronologico}</p>

              <h4 style={{ color: '#475569', borderBottom: '2px solid #e2e8f0', paddingBottom: '5px' }}>Análisis de Tipicidad</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.6' }}>{resultado.analisisTipicidad}</p>

              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ color: '#166534' }}>Elementos de Convicción Hallados</h4>
                  <ul style={{ fontSize: '14px', paddingLeft: '20px' }}>
                    {resultado.elementosConviccionEncontrados?.map((el, i) => <li key={i}>{el}</li>)}
                  </ul>
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ color: '#9a3412' }}>Diligencias Faltantes</h4>
                  <ul style={{ fontSize: '14px', paddingLeft: '20px' }}>
                    {resultado.elementosFaltantes?.map((el, i) => <li key={i}>{el}</li>)}
                  </ul>
                </div>
              </div>

              <h4 style={{ color: '#475569', borderBottom: '2px solid #e2e8f0', paddingBottom: '5px' }}>Sustento Jurídico Integral</h4>
              <p style={{ fontSize: '14px', lineHeight: '1.6', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                {resultado.sustentoJuridico}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default App