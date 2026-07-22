import { useState } from 'react'
import './App.css'
import ExtractorOCR from './ExtractorOCR';

function App() {
  // Lógica de datos (Intacta)
  const [tickets, setTickets] = useState([]); 
  const [cargando, setCargando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState('');
  const [resultado, setResultado] = useState(null);

  // NUEVO LÓGICA VISUAL: Controla en qué "pantalla" estamos
  const [vistaActual, setVistaActual] = useState('inicio'); // 'inicio', 'resumen', 'elementos', 'ocr'

  const subirTomo = async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;

    setCargando(true);
    setMensajeEstado(`Subiendo ${archivo.name}...`);
    
    const formData = new FormData();
    formData.append('documentoPdf', archivo);

    try {
      const respuesta = await fetch('https://api-fiscal-backend.onrender.com/api/subir-tomo', {
        method: 'POST',
        body: formData,
      });
      const datos = await respuesta.json();
      
      if (!respuesta.ok) throw new Error(datos.error || 'Error al subir');
      
      setTickets(prevTickets => [...prevTickets, datos.ticket]);
    } catch (error) {
      alert(`Error al subir tomo: ${error.message}`);
    } finally {
      setCargando(false);
      setMensajeEstado('');
      e.target.value = null; 
    }
  };

  // Función de Super Cola (Intacta)
  const procesarExpediente = async () => {
    if (tickets.length === 0) return alert('Agrega al menos un tomo al carrito.');
    
    setCargando(true);
    setResultado(null); 
    
    const tamanoLote = 3;
    const lotes = [];
    for (let i = 0; i < tickets.length; i += tamanoLote) {
      lotes.push(tickets.slice(i, i + tamanoLote));
    }

    let veredictoFinal = {
      decision: "ARCHIVAR",
      probabilidadExito: "Baja", 
      resumenCronologico: "",
      elementosConviccionEncontrados: [],
      elementosFaltantes: [],
      sustentoJuridico: ""
    };
    
    let indiciosDeViabilidad = false; 

    try {
      for (let i = 0; i < lotes.length; i++) {
        const tomosInicio = (i * tamanoLote) + 1;
        const tomosFin = Math.min((i + 1) * tamanoLote, tickets.length);
        setMensajeEstado(`Analizando Lote ${i + 1} de ${lotes.length} (Tomos ${tomosInicio} al ${tomosFin})...`);
        
        const respuesta = await fetch('https://api-fiscal-backend.onrender.com/api/analizar-tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickets: lotes[i] }) 
        });
        
        const datos = await respuesta.json();
        if (!respuesta.ok) throw new Error(datos.error || `Fallo en el lote ${i + 1}`);
        
        if (datos.resumenCronologico) {
          veredictoFinal.resumenCronologico += (veredictoFinal.resumenCronologico ? "\n\n" : "") + datos.resumenCronologico;
        }
        if (datos.sustentoJuridico) {
          veredictoFinal.sustentoJuridico += (veredictoFinal.sustentoJuridico ? "\n\n" : "") + datos.sustentoJuridico;
        }
        
        const fusionarLista = (listaActual, listaNueva) => {
            let arregloNuevo = Array.isArray(listaNueva) ? listaNueva : (listaNueva ? String(listaNueva).split('\n') : []);
            return [...listaActual, ...arregloNuevo.filter(item => item.trim() !== '')];
        };

        veredictoFinal.elementosConviccionEncontrados = fusionarLista(veredictoFinal.elementosConviccionEncontrados, datos.elementosConviccionEncontrados);
        veredictoFinal.elementosFaltantes = fusionarLista(veredictoFinal.elementosFaltantes, datos.elementosFaltantes);

        const prob = String(datos.probabilidadExito).toUpperCase();
        if (prob.includes('ALTA') || prob.includes('MEDIA')) {
          indiciosDeViabilidad = true;
        }
      }

      veredictoFinal.probabilidadExito = indiciosDeViabilidad ? "Media/Alta (Existen elementos de convicción suficientes)" : "Baja (Carece de elementos suficientes)";
      veredictoFinal.decision = indiciosDeViabilidad ? "FORMALIZAR" : "ARCHIVAR";

      setResultado(veredictoFinal); 
      setMensajeEstado('¡Análisis masivo completado con éxito!');

    } catch (error) {
      alert(`Ocurrió un problema procesando la cola: ${error.message}`);
      setMensajeEstado('Proceso abortado.');
    } finally {
      setCargando(false);
      setTimeout(() => setMensajeEstado(''), 4000); 
    }
  };

  const limpiarCarrito = () => {
    setTickets([]);
    setResultado(null);
  };

  const exportarAWord = () => {
    if (!resultado) return;

    const formatearLista = (datos) => {
      if (Array.isArray(datos)) return datos.map(item => `<li>${item}</li>`).join('');
      if (typeof datos === 'string') return datos.split('\n').filter(i => i.trim()).map(item => `<li>${item.replace(/^- /, '')}</li>`).join('');
      return '<li>No hay datos</li>';
    };

    const elementosHTML = formatearLista(resultado.elementosConviccionEncontrados);
    const diligenciasHTML = formatearLista(resultado.elementosFaltantes);

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

    const blob = new Blob(['\ufeff', contenidoHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Proyeccion_Fiscal_Analisis.doc';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // =========================================================================
  // NUEVA ESTRUCTURA VISUAL DE RENDERIZADO (DASHBOARD)
  // =========================================================================
  return (
    <div className="app-fondo">
      
      {/* ----------------- VISTA 1: DASHBOARD PRINCIPAL ----------------- */}
      {vistaActual === 'inicio' && (
        <div className="dashboard-container">
          <div>
            <h1 className="titulo-central">PROYECCIÓN FISCAL</h1>
            <p className="subtitulo-central">DÉBORA</p>
          </div>

          {/* TARJETA PRINCIPAL (Motor de Carga y Análisis) */}
          <div className="tarjeta-principal">
            <div className="zona-carga">
              <h2>Añadir PDFs al Caso</h2>
              <input 
                type="file" 
                id="file-upload" 
                accept=".pdf" 
                onChange={subirTomo} 
                disabled={cargando} 
                style={{ display: 'none' }} 
              />
              <label htmlFor="file-upload" style={{
                background: '#3b82f6', color: 'white', padding: '12px 24px', 
                borderRadius: '6px', cursor: cargando ? 'not-allowed' : 'pointer',
                display: 'inline-block', fontWeight: 'bold'
              }}>
                {cargando && mensajeEstado.includes('Subiendo') ? '⏳ Cargando Tomo...' : '📄 Seleccionar Archivo'}
              </label>

              {mensajeEstado && (
                <p style={{ color: '#f59e0b', fontWeight: 'bold', marginTop: '15px' }}>{mensajeEstado}</p>
              )}
            </div>

            {/* Tomos en Memoria */}
            {tickets.length > 0 && (
              <div style={{ textAlign: 'left', background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#475569' }}>Tomos en Memoria ({tickets.length}):</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#10b981', fontSize: '0.9rem' }}>
                  {tickets.map((t, i) => (
                    <li key={i}>✅ {t.nombre}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Controles de Análisis */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
              <button 
                onClick={procesarExpediente} 
                disabled={cargando || tickets.length === 0} 
                style={{
                  background: tickets.length > 0 && !cargando ? '#1e293b' : '#cbd5e1',
                  color: 'white', border: 'none', padding: '12px 24px', borderRadius: '6px',
                  fontWeight: 'bold', cursor: tickets.length > 0 && !cargando ? 'pointer' : 'not-allowed'
                }}
              >
                {cargando && mensajeEstado.includes('Analizando') ? '🧠 Procesando Lotes...' : '⚖️ Ejecutar Análisis Cruzado'}
              </button>

              {tickets.length > 0 && !cargando && (
                <button onClick={limpiarCarrito} style={{
                  background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', 
                  padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                }}>
                  🗑️ Limpiar
                </button>
              )}
            </div>

            {/* Veredicto Resumido (Aparece al terminar el análisis) */}
            {resultado && (
              <div style={{ marginTop: '20px' }}>
                <div className={`banner-veredicto ${
                  String(resultado.probabilidadExito).toUpperCase().includes('ALTA') || 
                  String(resultado.probabilidadExito).toUpperCase().includes('MEDIA') 
                  ? 'banner-formalizar' : 'banner-archivar'
                }`}>
                  {String(resultado.probabilidadExito).toUpperCase().includes('ALTA') || 
                  String(resultado.probabilidadExito).toUpperCase().includes('MEDIA') 
                    ? '⚖️ SUGERENCIA: FORMALIZAR INVESTIGACIÓN' 
                    : '🗂️ SUGERENCIA: ARCHIVO PRELIMINAR'}
                </div>
                <button onClick={exportarAWord} className="boton-exportar" style={{ margin: '0 auto' }}>
                  💾 Exportar Informe Completo a Word
                </button>
              </div>
            )}
          </div>

          {/* TARJETAS SECUNDARIAS (Navegación) */}
          <div className="modulos-grid">
            <div className="tarjeta-modulo resumen" onClick={() => setVistaActual('resumen')}>
              <span className="icono-modulo">📝</span>
              <h3>Resumen Fáctico</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Cronología de los hechos del caso.</p>
            </div>
            
            <div className="tarjeta-modulo elementos" onClick={() => setVistaActual('elementos')}>
              <span className="icono-modulo">🔎</span>
              <h3>Elementos de Convicción</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Pruebas halladas y diligencias faltantes.</p>
            </div>
            
            <div className="tarjeta-modulo ocr" onClick={() => setVistaActual('ocr')}>
              <span className="icono-modulo">🖨️</span>
              <h3>Extractor OCR</h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Digitaliza fojas específicas a texto plano.</p>
            </div>
          </div>
        </div>
      )}


      {/* ----------------- VISTA 2: RESUMEN FÁCTICO ----------------- */}
      {vistaActual === 'resumen' && (
        <div className="vista-detalle">
          <button className="boton-volver" onClick={() => setVistaActual('inicio')}>⬅ Volver al Panel Principal</button>
          <h2 style={{ color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>📝 Resumen Fáctico y Sustento Jurídico</h2>
          
          {resultado ? (
            <>
              <p style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', lineHeight: '1.8', fontSize: '1.05rem', color: '#334155' }}>
                {resultado.resumenCronologico}
              </p>
              <h3 style={{ marginTop: '30px' }}>Sustento Jurídico Aplicable</h3>
              <p style={{ background: '#f1f5f9', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #64748b', lineHeight: '1.8' }}>
                {resultado.sustentoJuridico}
              </p>
            </>
          ) : (
            <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>
              Aún no hay un análisis. Ve al Panel Principal, añade los tomos y ejecuta el Análisis Cruzado.
            </p>
          )}
        </div>
      )}


      {/* ----------------- VISTA 3: ELEMENTOS DE CONVICCIÓN ----------------- */}
      {vistaActual === 'elementos' && (
        <div className="vista-detalle">
          <button className="boton-volver" onClick={() => setVistaActual('inicio')}>⬅ Volver al Panel Principal</button>
          
          {resultado ? (
            <>
              <h2 style={{ color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>🔎 Elementos de Convicción Hallados</h2>
              <ul style={{ background: '#f8fafc', padding: '20px 20px 20px 40px', borderRadius: '8px', borderLeft: '4px solid #3b82f6', fontSize: '1.05rem', lineHeight: '1.6' }}>
                {Array.isArray(resultado.elementosConviccionEncontrados) 
                  ? resultado.elementosConviccionEncontrados.map((item, i) => <li key={i} style={{marginBottom: '10px'}}>{item}</li>)
                  : String(resultado.elementosConviccionEncontrados || '').split('\n').map((item, i) => item.trim() !== '' ? <li key={i} style={{marginBottom: '10px'}}>{item.replace(/^- /, '')}</li> : null)
                }
              </ul>

              <h2 style={{ color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginTop: '40px' }}>📋 Plan de Trabajo (Diligencias Faltantes)</h2>
              <ul className="lista-diligencias">
                {Array.isArray(resultado.elementosFaltantes)
                  ? resultado.elementosFaltantes.map((item, i) => (
                      <li key={i}>
                        <input type="checkbox" className="checkbox-fiscal" id={`check-${i}`} />
                        <label htmlFor={`check-${i}`} style={{ cursor: 'pointer', fontSize: '1.05rem' }}>{item}</label>
                      </li>
                    ))
                  : String(resultado.elementosFaltantes || '').split('\n').map((item, i) => item.trim() !== '' ? (
                      <li key={i}>
                        <input type="checkbox" className="checkbox-fiscal" id={`check-${i}`} />
                        <label htmlFor={`check-${i}`} style={{ cursor: 'pointer', fontSize: '1.05rem' }}>{item.replace(/^- /, '')}</label>
                      </li>
                    ) : null)
                }
              </ul>
            </>
          ) : (
             <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>
              Aún no hay un análisis. Ve al Panel Principal, añade los tomos y ejecuta el Análisis Cruzado.
            </p>
          )}
        </div>
      )}


      {/* ----------------- VISTA 4: EXTRACTOR OCR ----------------- */}
      {vistaActual === 'ocr' && (
        <div className="vista-detalle">
          <button className="boton-volver" onClick={() => setVistaActual('inicio')}>⬅ Volver al Panel Principal</button>
          <div style={{ marginTop: '20px' }}>
            {/* Aquí se inyecta tu componente independiente intacto */}
            <ExtractorOCR />
          </div>
        </div>
      )}

    </div>
  )
}

export default App