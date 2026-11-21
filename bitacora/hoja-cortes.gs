/**
 * Hoja de Google "Cortes de carga" para la Bitácora EEASA (versión 2).
 * La macro de Excel (botón SUBIR A DRIVE) manda aquí un corte por alimentador.
 * La app del celular (módulo Cortes de energía) llena Incidencia y Clientes leyendo una foto del ADMS.
 * El botón "Llenar Bitácora" lee los pendientes, llena y guarda un formulario por cada uno
 * y los marca con x en la columna Subido.
 *
 * Cambios de la versión 2:
 *  - SUBIR A DRIVE ya no borra la Incidencia ni los Clientes que puso la app: si el Excel los manda vacíos,
 *    se quedan los de la hoja. Si el Excel trae un valor, gana el del Excel (corrección a mano).
 *  - La respuesta de SUBIR A DRIVE trae "incidencia" y "clientes" de la hoja, para que la macro los copie al Excel.
 *  - ?sinInc=1      -> cortes pendientes sin incidencia (para la app).
 *  - ?ponerInc=[...] -> la app guarda incidencia y clientes: [{"clave":"…","incidencia":"…","clientes":"…"}, …]
 *  - ?leerInc=1     -> clave, incidencia y clientes de todos los cortes (por si la macro quiere bajarlos aparte).
 *
 * Para actualizar: Extensiones > Apps Script, reemplaza todo por este código, guarda y luego
 * Implementar > Gestionar implementaciones > (lápiz) editar > Versión: Nueva versión > Implementar.
 * Así la URL /exec no cambia y el Excel y el botón Llenar Bitácora siguen funcionando.
 */
const NOMBRE_HOJA = 'Cortes';
const COLUMNAS = ['Subido', 'Incidencia', 'Clientes afectados', 'Estado', 'Fecha/hora desconexión',
  'Fecha/hora conexión', 'Duración', 'Falla S/E', 'Falla alimentador', 'Corriente A', 'Corriente B',
  'Corriente C', 'kW (referencia)', 'Origen / tipo', 'Causa', 'Subcausa', 'Descripción', 'Código', 'Clave',
  'Subido el'];
const C_INC = 1, C_CLI = 2, C_DESC = 16, C_CLAVE = 18;   // índices desde 0

function hoja_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(NOMBRE_HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(NOMBRE_HOJA);
    hoja.getRange('A:T').setNumberFormat('@');          // todo como texto: fechas y códigos no cambian
    hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function respuesta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

const soloDigitos_ = v => String(v == null ? '' : v).replace(/\D/g, '');

// Agrega "INC N° 123." a la descripción si aún no lo tiene (igual que la fórmula del Excel).
function descConInc_(desc, inc) {
  desc = String(desc || '');
  if (!inc || /INC\s*N/i.test(desc)) return desc;
  return desc.replace(/\s+$/, '') + ' INC N° ' + inc + '.';
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const candado = LockService.getScriptLock();
  candado.waitLock(20000);
  try {
    const hoja = hoja_();
    const datos = hoja.getDataRange().getDisplayValues();
    const buscar = clave => {
      for (let i = 1; i < datos.length; i++) if (String(datos[i][C_CLAVE]) === clave) return i;
      return -1;
    };

    // Excel sube (o actualiza) un corte: 19 valores, columnas A a S de Para_Bitacora
    if (p.subir) {
      const f = JSON.parse(p.subir).slice(0, 19).map(v => String(v == null ? '' : v));
      while (f.length < 19) f.push('');
      const clave = f[C_CLAVE];
      if (!clave) return respuesta_({ ok: false, error: 'sin clave' });
      const i = buscar(clave);
      const enHoja = i >= 0 ? datos[i] : null;
      if (enHoja && String(enHoja[0]).trim())   // ya está en la Bitácora
        return respuesta_({ ok: true, subido: true, incidencia: enHoja[C_INC], clientes: enHoja[C_CLI] });
      f[0] = '';
      if (enHoja) {
        // No borrar lo que puso la app: si el Excel viene vacío, se queda lo de la hoja
        if (!f[C_INC].trim()) f[C_INC] = enHoja[C_INC];
        if (!f[C_CLI].trim()) f[C_CLI] = enHoja[C_CLI];
        f[C_DESC] = descConInc_(f[C_DESC], soloDigitos_(f[C_INC]));
        hoja.getRange(i + 1, 1, 1, 19).setValues([f]);
      } else {
        const fila = hoja.getLastRow() + 1;
        hoja.getRange(fila, 1, 1, 20).setNumberFormat('@');
        hoja.getRange(fila, 1, 1, 19).setValues([f]);
      }
      return respuesta_({ ok: true, subido: false, incidencia: f[C_INC], clientes: f[C_CLI] });
    }

    // Llenar Bitácora marca un corte que ya guardó
    if (p.marcar) {
      const i = buscar(String(p.marcar));
      if (i >= 0) hoja.getRange(i + 1, 1, 1, 20).setValues([['x'].concat(datos[i].slice(1, 19).map(String), [new Date().toLocaleString('es-EC')])]);
      return respuesta_({ ok: i >= 0 });
    }

    // App: cortes pendientes (sin x) que aún no tienen incidencia
    if (p.sinInc) {
      const cortes = datos.slice(1)
        .filter(r => !String(r[0]).trim() && String(r[C_CLAVE]) && !String(r[C_INC]).trim())
        .map(r => ({ clave: r[C_CLAVE], desconexion: r[4], conexion: r[5], se: r[7], alimentador: r[8], codigo: r[17], estado: r[3] }));
      return respuesta_({ ok: true, cortes: cortes });
    }

    // App: guarda incidencia y clientes de uno o varios cortes
    if (p.ponerInc) {
      const lista = [].concat(JSON.parse(p.ponerInc));
      const hechos = [];
      for (const it of lista) {
        const i = buscar(String(it.clave || ''));
        if (i < 0 || String(datos[i][0]).trim()) continue;          // no existe o ya está en la Bitácora
        const inc = soloDigitos_(it.incidencia);
        if (inc) {
          hoja.getRange(i + 1, C_INC + 1).setValue(inc);
          hoja.getRange(i + 1, C_DESC + 1).setValue(descConInc_(datos[i][C_DESC], inc));
        }
        if (soloDigitos_(it.clientes)) hoja.getRange(i + 1, C_CLI + 1).setValue(soloDigitos_(it.clientes));
        hechos.push(it.clave);
      }
      return respuesta_({ ok: true, guardados: hechos });
    }

    // Macro (opcional): clave -> incidencia y clientes de todos los cortes
    if (p.leerInc) {
      const lista = datos.slice(1).filter(r => String(r[C_CLAVE]))
        .map(r => ({ clave: r[C_CLAVE], incidencia: r[C_INC], clientes: r[C_CLI], subido: String(r[0]).trim() }));
      return respuesta_({ ok: true, cortes: lista });
    }

    // Lista de pendientes para Llenar Bitácora (mismo orden de columnas que Para_Bitacora;
    // 17 y 18 vacías porque un corte no tiene protecciones ni reconectador; 19 = clave)
    const filas = datos.slice(1)
      .filter(r => !String(r[0]).trim() && String(r[C_CLAVE]))
      .map(r => r.slice(0, 17).map(String).concat(['', '', String(r[C_CLAVE])]));
    return respuesta_({ filas: filas });
  } finally {
    candado.releaseLock();
  }
}
