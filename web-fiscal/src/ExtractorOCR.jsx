import React, { useState } from 'react';

const ExtractorOCR = () => {
  const [archivo, setArchivo] = useState(null);
  const [instruccion, setInstruccion] = useState("Transcribe la página 1");
  const [resultado, setResultado] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);

  // Tu URL exacta de Render para esta nueva ruta
  const BACKEND_URL = "https://api-fiscal-backend.onrender.com/api/transcribir-fojas";

  const manejarEnvio = async (e) => {
    e.preventDefault();
    if (!archivo) return alert("Por favor, sube un documento.");

    setCargando(true);
    setError("");
    setResultado("");
    setCopiado(false);

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

      setResultado(data.texto);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const copiarAlPortapapeles = () => {
    navigator.clipboard.writeText(resultado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
        📄 Transcripción Literal (OCR con IA)
      </h2>
      <p style={{ color: '#7f8c8d' }}>
        Sube un PDF o imagen y dale una orden específica a la IA. <br/>
        <i>Ejemplo: "Transcribe de fojas 12 a 15" o "Transcribe el folio 25".</i>
      </p>

      <form onSubmit={manejarEnvio} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
        
        {/* Caja para subir el archivo */}
        <div style={{ border: '2px dashed #bdc3c7', padding: '20px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8f9fa' }}>
          <input 
            type="file" 
            accept=".pdf, image/*" 
            onChange={(e) => setArchivo(e.target.files[0])} 
            required
          />
        </div>

        {/* Caja para escribir la instrucción */}
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px', color: '#34495e' }}>Instrucción exacta:</label>
          <input 
            type="text" 
            value={instruccion} 
            onChange={(e) => setInstruccion(e.target.value)} 
            placeholder='Ej: Transcribe la página 5'
            style={{ width: '95%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '16px' }}
            required
          />
        </div>

        {/* Botón de Procesar */}
        <button 
          type="submit" 
          disabled={cargando}
          style={{ 
            padding: '12px', backgroundColor: cargando ? '#95a5a6' : '#2980b9', 
            color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: cargando ? 'wait' : 'pointer' 
          }}
        >
          {cargando ? "⏳ Transcribiendo... (Esto puede tomar hasta 20 segundos)" : "Procesar Transcripción"}
        </button>
      </form>

      {/* Alerta de Error */}
      {error && <div style={{ color: '#e74c3c', backgroundColor: '#fadbd8', padding: '10px', borderRadius: '5px', fontWeight: 'bold' }}>Error: {error}</div>}

      {/* Caja de Resultado (Se muestra solo cuando la IA termina) */}
      {resultado && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, color: '#27ae60' }}>✅ Transcripción Exitosa:</h3>
            <button 
              onClick={copiarAlPortapapeles}
              style={{ padding: '8px 15px', backgroundColor: copiado ? '#27ae60' : '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {copiado ? "¡Copiado al portapapeles!" : "📋 Copiar Texto"}
            </button>
          </div>
          
          <textarea 
            readOnly 
            value={resultado}
            style={{ width: '95%', height: '300px', padding: '15px', borderRadius: '8px', border: '1px solid #bdc3c7', backgroundColor: '#f9f9f9', fontFamily: 'monospace', fontSize: '15px', resize: 'vertical' }}
          />
        </div>
      )}
    </div>
  );
};

export default ExtractorOCR;