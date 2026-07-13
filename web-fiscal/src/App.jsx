import { useState } from 'react'
import './App.css'

function App() {
  const [tickets, setTickets] = useState([]); // Aquí guardaremos los tickets de los tomos subidos
  const [cargando, setCargando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState('');
  const [resultado, setResultado] = useState(null);

  const subirTomo = async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;

    setCargando(true);
    setMensajeEstado(`Subiendo ${archivo.name}...`);
    
    const formData = new FormData();
    formData.append('documentoPdf', archivo);

    try {
      // Mandamos el archivo a la Ruta 1 de nuestro servidor
      const respuesta = await fetch('https://api-fiscal-backend.onrender.com/api/subir-tomo', {
        method: 'POST',
        body: formData,
      });
      const datos = await respuesta.json();
      
      if (!respuesta.ok) throw new Error(datos.error || 'Error al subir');
      
      // Si todo sale bien, guardamos el "Ticket" en nuestro carrito
      setTickets(prevTickets => [...prevTickets, datos.ticket]);
    } catch (error) {
      alert(`Error al subir tomo: ${error.message}`);
    } finally {
      setCargando(false);
      setMensajeEstado('');
      e.target.value = null; // Reseteamos el botón por si quiere subir otro
    }
  };

  // 3. Función para mandar a analizar todos los tickets juntos
  const procesarExpediente = async () => {
    if (tickets.length === 0) return alert('Agrega al menos un tomo al carrito.');
    
    setCargando(true);
    setMensajeEstado('Analizando cruce de información. Esto puede tardar un par de minutos...');
    
    try {
      // Mandamos los tickets a la Ruta 2 de nuestro servidor
      const respuesta = await fetch('https://api-fiscal-backend.onrender.com/api/analizar-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickets }) // Enviamos el array de tickets
      });
      
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error || 'Error en el análisis');
      
      setResultado(datos);
    } catch (error) {
      alert(`Ocurrió un problema: ${error.message}`);
    } finally {
      setCargando(false);
      setMensajeEstado('');
    }
  };

  // 4. Función para limpiar y empezar un nuevo caso
  const limpiarCarrito = () => {
    setTickets([]);
    setResultado(null);
  };
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
        {/* === ZONA DEL CARRITO DE TOMOS === */}
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* Botón para subir un tomo */}
          <div>
            <input 
              type="file" 
              id="file-upload" 
              accept=".pdf" 
              onChange={subirTomo} 
              disabled={cargando} 
              style={{ display: 'none' }} 
            />
            <label htmlFor="file-upload" style={{
              background: 'transparent', border: '1px solid #94a3b8', color: '#f8fafc',
              padding: '10px', borderRadius: '6px', cursor: cargando ? 'not-allowed' : 'pointer',
              display: 'block', textAlign: 'center', fontSize: '0.9rem'
            }}>
              {cargando && mensajeEstado.includes('Subiendo') ? '⏳ Cargando...' : '📄 + Agregar Tomo'}
            </label>
          </div>

          {/* Lista visual de tomos subidos (El Carrito) */}
          {tickets.length > 0 && (
            <div style={{ background: '#1e293b', padding: '10px', borderRadius: '6px' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#cbd5e1', borderBottom: '1px solid #334155', paddingBottom: '5px' }}>
                Tomos en Memoria ({tickets.length}):
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.8rem', color: '#10b981' }}>
                {tickets.map((t, i) => (
                  <li key={i} style={{ marginBottom: '5px', wordBreak: 'break-all' }}>✅ {t.nombre}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Botón Principal de Análisis */}
          <button 
            onClick={procesarExpediente} 
            disabled={cargando || tickets.length === 0} 
            style={{
              background: tickets.length > 0 && !cargando ? '#3b82f6' : '#475569',
              color: 'white', border: 'none', padding: '12px', borderRadius: '6px',
              fontWeight: 'bold', cursor: tickets.length > 0 && !cargando ? 'pointer' : 'not-allowed'
            }}
          >
            {cargando && mensajeEstado.includes('Analizando') ? '🧠 Analizando Caso...' : '⚖️ Analizar Caso Completo'}
          </button>

          {/* Botón para Limpiar */}
          {tickets.length > 0 && (
             <button onClick={limpiarCarrito} disabled={cargando} style={{
               background: 'transparent', color: '#ef4444', border: 'none',
               cursor: 'pointer', fontSize: '0.85rem', marginTop: '10px'
             }}>
               🗑️ Limpiar y empezar de nuevo
             </button>
          )}

          {/* Mensajes de estado para Débora */}
          {mensajeEstado && (
            <div style={{ fontSize: '0.8rem', color: '#fbbf24', textAlign: 'center', marginTop: '10px' }}>
              {mensajeEstado}
            </div>
          )}
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
            
            {/* Aquí agregamos el cajón contenedor */}
            <div className="cajon-scroll-horizontal">
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
            </div>
            {/* Sección de Elementos de Convicción */}
            <h3 style={{ marginTop: '35px' }}>Elementos de Convicción Hallados</h3>
            <ul style={{ background: '#f8fafc', padding: '20px 20px 20px 40px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
              {Array.isArray(resultado.elementosConviccionEncontrados) 
                ? resultado.elementosConviccionEncontrados.map((item, i) => <li key={i} style={{marginBottom: '10px'}}>{item}</li>)
                : String(resultado.elementosConviccionEncontrados || 'No se detectaron elementos.').split('\n').map((item, i) => item.trim() !== '' && item !== 'undefined' ? <li key={i} style={{marginBottom: '10px'}}>{item.replace(/^- /, '')}</li> : null)
              }
            </ul>

            {/* Sección de Diligencias Faltantes */}
            <h3 style={{ marginTop: '35px' }}>Diligencias Faltantes (Plan de Trabajo)</h3>
            <ul className="lista-diligencias">
              {Array.isArray(resultado.elementosFaltantes)
                ? resultado.elementosFaltantes.map((item, i) => (
                    <li key={i}>
                      <input type="checkbox" className="checkbox-fiscal" id={`check-${i}`} />
                      <label htmlFor={`check-${i}`} style={{ cursor: 'pointer' }}>{item}</label>
                    </li>
                  ))
                : String(resultado.elementosFaltantes || 'No se sugirieron diligencias adicionales.').split('\n').map((item, i) => item.trim() !== '' && item !== 'undefined' ? (
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
