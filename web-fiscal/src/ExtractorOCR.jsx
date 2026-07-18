import React, { useState } from 'react';

const ExtractorOCR = () => {
  const [archivo, setArchivo] = useState(null);
  const [instruccion, setInstruccion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  
  // NUEVO: Aquí guardaremos todos los fragmentos que vayamos extrayendo
  const [borradorAcumulado, setBorradorAcumulado] = useState([]);

  // URL de tu backend
  const BACKEND_URL = "https://api-fiscal-backend.onrender.com/api/transcribir-fojas";

  const manejarEnvio = async (e) => {
    e.preventDefault();
    if (!archivo) return alert("Por favor, sube un documento.");
    if (!instruccion) return alert("Por favor, escribe una instrucción.");

    setCargando(true);
    setError("");

    const formData = new FormData();
    formData.append("documento", archivo);
    formData.append("instruccion", instruccion);

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al procesar el archivo");
      }

      // Agregamos el nuevo texto a la lista acumulada
      setBorradorAcumulado(prev => [...prev, { 
        orden: instruccion, 
        texto: data.texto 
      }]);
      
      // Limpiamos la caja de texto para que Débora pida la siguiente foja
      setInstruccion(""); 

    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  // Función mágica para exportar todos los fragmentos juntos a Word
  // Función mágica para exportar todos los fragmentos juntos a Word (VERSIÓN LIMPIA)
  const exportarTodoAWord = () => {
    if (borradorAcumulado.length === 0) return;

    // Estilos base para que Word lo lea como un documento formal
    let contenidoHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Transcripciones</title></head>
      <body style="font-family: 'Arial', sans-serif; font-size: 11pt;">
        <h2 style="text-align: center; color: #000000;">Documento de Transcripciones (OCR)</h2>
        <br>
    `;

    borradorAcumulado.forEach((item, index) => {
      // 1. EL FILTRO DE LIMPIEZA ABSOLUTA
      let textoLimpio = item.texto
        // a) Convertimos saltos de línea dobles (párrafos reales) en etiquetas HTML de párrafo
        .replace(/\n{2,}/g, '</p><p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">')
        // b) Eliminamos los saltos de línea simples (que cortan oraciones a la mitad) y los volvemos espacios
        .replace(/\n/g, ' ')
        // c) Eliminamos espacios en blanco gigantes (más de 2 espacios seguidos)
        .replace(/\s{2,}/g, ' ')
        .trim();

      // 2. Lo inyectamos en el documento HTML
      contenidoHtml += `
        <h4 style="color: #333333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Fragmento ${index + 1} (${item.orden}):</h4>
        <p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">
          ${textoLimpio}
        </p>
        <br>
      `;
    });

    contenidoHtml += `</body></html>`;

    // Truco para descargar el .doc
    const blob = new Blob(['\ufeff', contenidoHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Transcripciones_Fiscales_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const limpiarBorrador = () => {
    if (window.confirm("¿Estás seguro de borrar todo el trabajo acumulado?")) {
      setBorradorAcumulado([]);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
        📄 Extractor OCR (Acumulativo)
      </h2>
      <p style={{ color: '#7f8c8d' }}>
        Sube el PDF, pide los fragmentos que necesites uno por uno, y expórtalos todos juntos a Word al final.
      </p>

      {/* ZONA DE CONTROL (Formulario) */}
      <form onSubmit={manejarEnvio} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
        
        <div style={{ border: '2px dashed #bdc3c7', padding: '15px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8f9fa' }}>
          <input 
            type="file" 
            accept=".pdf, image/*" 
            onChange={(e) => setArchivo(e.target.files[0])} 
            required
          />
        </div>

        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px', color: '#34495e' }}>Siguiente instrucción:</label>
          <input 
            type="text" 
            value={instruccion} 
            onChange={(e) => setInstruccion(e.target.value)} 
            placeholder='Ej: Transcribe de fojas 61 a 80'
            style={{ width: '95%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '16px' }}
          />
        </div>

        <button 
          type="submit" 
          disabled={cargando}
          style={{ 
            padding: '12px', backgroundColor: cargando ? '#95a5a6' : '#2980b9', 
            color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: cargando ? 'wait' : 'pointer' 
          }}
        >
          {cargando ? "⏳ Transcribiendo y Acumulando..." : "Extraer y Añadir al Borrador"}
        </button>
      </form>

      {error && <div style={{ color: '#e74c3c', backgroundColor: '#fadbd8', padding: '10px', borderRadius: '5px', fontWeight: 'bold' }}>Error: {error}</div>}

      {/* ZONA DE ACUMULACIÓN (Resultados) */}
      {borradorAcumulado.length > 0 && (
        <div style={{ marginTop: '30px', borderTop: '2px dashed #bdc3c7', paddingTop: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#27ae60' }}>
              📚 Fragmentos en memoria: {borradorAcumulado.length}
            </h3>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={limpiarBorrador}
                style={{ padding: '10px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🗑️ Limpiar
              </button>
              
              <button 
                onClick={exportarTodoAWord}
                style={{ padding: '10px 15px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                💾 Exportar TODO a Word
              </button>
            </div>
          </div>
          
          {/* Mostramos los fragmentos apilados */}
          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
            {borradorAcumulado.map((item, index) => (
              <div key={index} style={{ marginBottom: '20px', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #3498db' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#34495e' }}>Fragmento {index + 1}: <span style={{color: '#7f8c8d'}}>{item.orden}</span></h4>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', backgroundColor: 'white', padding: '10px', border: '1px solid #e2e8f0' }}>
                  {item.texto}
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
};

export default ExtractorOCR;