// Sugestão do estado (UF) pela localização APROXIMADA do aparelho (onboarding e diálogo "Escolha seu estado").
//
// Privacidade (regra do produto): as coordenadas só existem em memória, dentro de localizarUf(). NUNCA são enviadas a
// servidor algum, gravadas (localStorage, cache, cookies…) nem registradas em log. O único acesso à rede é o download do
// contorno PÚBLICO das UFs (/data/geo/ufs.json, malha oficial do IBGE), o mesmo arquivo para todos: o cálculo é feito
// aqui no aparelho e só a sigla que o usuário confirmar é guardada (prefs.ufPadrao).
//
// Regra (a mesma do app Android; casos de referência em contracts/geo_cases.json): o ponto pertence à UF cujo anel externo
// o contém (ray casting) sem cair em um buraco desse polígono; fora de todos os contornos (litoral/ilhas da malha
// simplificada), vale a UF de contorno mais próximo, desde que a até 30 km; senão, null (fora do Brasil).

export const URL_CONTORNOS_UF = '/data/geo/ufs.json';
export const DISTANCIA_MAXIMA_KM = 30;
const KM_POR_GRAU_LON_NO_EQUADOR = 111.32;
const KM_POR_GRAU_LAT = 110.57;

export const PROCURANDO_UF = 'Procurando seu estado pela localização aproximada…';
/** Mensagens curtas para cada motivo de falha de localizarUf(). */
export const MENSAGENS_LOCALIZACAO = Object.freeze({
  negada: 'Sem permissão para usar a localização. Escolha seu estado na lista.',
  indisponivel: 'Não foi possível obter a localização neste aparelho. Escolha seu estado na lista.',
  tempo: 'A localização demorou demais. Tente de novo ou escolha seu estado na lista.',
  fora: 'Sua localização aproximada parece estar fora do Brasil. Escolha seu estado na lista.',
  erro: 'Não foi possível sugerir o estado agora. Escolha seu estado na lista.'
});

/** Ray casting: o ponto (lon, lat) está dentro do anel [[lon, lat], ...]? */
function dentroDoAnel(lon, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0];
    const yi = anel[i][1];
    const xj = anel[j][0];
    const yj = anel[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Distância (km) da origem ao segmento a–b (coordenadas já em km, centradas no ponto). */
function distanciaAoSegmento(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * UF que contém o ponto (WGS84), ou null se estiver fora do Brasil. Função pura (não acessa rede, armazenamento nem log).
 * @param {number} lat
 * @param {number} lon
 * @param {object} ufsGeo conteúdo de data/geo/ufs.json (ou só o mapa `ufs`: { SIGLA: [polígono, ...] })
 * @returns {string|null}
 */
export function ufPorCoordenada(lat, lon, ufsGeo) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const ufs = ufsGeo?.ufs ?? ufsGeo;
  if (!ufs || typeof ufs !== 'object') return null;
  const entradas = Object.entries(ufs).filter(([, poligonos]) => Array.isArray(poligonos));

  for (const [uf, poligonos] of entradas) {
    for (const [externo, ...buracos] of poligonos) {
      if (externo?.length > 2 && dentroDoAnel(lon, lat, externo) && !buracos.some((b) => dentroDoAnel(lon, lat, b))) return uf;
    }
  }

  // fora de todos os contornos: UF de contorno mais próximo (projeção equiretangular local), até DISTANCIA_MAXIMA_KM
  const kx = KM_POR_GRAU_LON_NO_EQUADOR * Math.cos((lat * Math.PI) / 180);
  const ky = KM_POR_GRAU_LAT;
  let melhor = null;
  let menor = Infinity;
  for (const [uf, poligonos] of entradas) {
    for (const poligono of poligonos) {
      for (const anel of poligono) {
        for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
          const d = distanciaAoSegmento((anel[j][0] - lon) * kx, (anel[j][1] - lat) * ky, (anel[i][0] - lon) * kx, (anel[i][1] - lat) * ky);
          if (d < menor) { menor = d; melhor = uf; }
        }
      }
    }
  }
  return menor <= DISTANCIA_MAXIMA_KM ? melhor : null;
}

/** O navegador oferece geolocalização? (não pede permissão) */
export const geolocalizacaoDisponivel = (geolocation = globalThis.navigator?.geolocation) => typeof geolocation?.getCurrentPosition === 'function';

/** Estado da permissão de localização pela Permissions API: 'granted' | 'prompt' | 'denied', ou null se desconhecido. */
export async function estadoPermissaoLocalizacao(permissions = globalThis.navigator?.permissions) {
  try {
    const st = await permissions?.query?.({ name: 'geolocation' });
    return st?.state ?? null;
  } catch {
    return null;
  }
}

/** Posição aproximada (sem GPS de alta precisão; aceita leitura de até 30 min). `limiteMs` cobre navegadores que nunca respondem. */
function posicaoAproximada(geolocation, timeoutMs, limiteMs) {
  return new Promise((ok, falha) => {
    const guarda = setTimeout(() => falha({ code: 3 }), limiteMs);
    try {
      geolocation.getCurrentPosition(
        (p) => { clearTimeout(guarda); ok(p); },
        (e) => { clearTimeout(guarda); falha(e); },
        { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: timeoutMs });
    } catch (e) {
      clearTimeout(guarda);
      falha(e);
    }
  });
}

/**
 * Pede a localização aproximada e calcula a UF NO APARELHO.
 * @returns {Promise<{uf: string|null, motivo: 'ok'|'negada'|'indisponivel'|'tempo'|'fora'|'erro'}>}
 */
export async function localizarUf({
  timeoutMs = 10_000, limiteMs = 45_000, geolocation = globalThis.navigator?.geolocation, fetchFn = globalThis.fetch?.bind(globalThis),
  url = URL_CONTORNOS_UF
} = {}) {
  if (!geolocalizacaoDisponivel(geolocation)) return { uf: null, motivo: 'indisponivel' };
  let lat;
  let lon;
  try {
    const p = await posicaoAproximada(geolocation, timeoutMs, limiteMs);
    lat = Number(p?.coords?.latitude);
    lon = Number(p?.coords?.longitude);
  } catch (e) {
    const motivo = { 1: 'negada', 2: 'indisponivel', 3: 'tempo' }[e?.code] ?? 'erro';
    return { uf: null, motivo };
  }
  let contornos;
  try {
    const r = await fetchFn(url); // só o arquivo público dos contornos: nada da posição vai na requisição
    if (!r.ok) return { uf: null, motivo: 'erro' };
    contornos = await r.json();
  } catch {
    return { uf: null, motivo: 'erro' };
  }
  const uf = ufPorCoordenada(lat, lon, contornos);
  return uf ? { uf, motivo: 'ok' } : { uf: null, motivo: 'fora' };
}

/** UF sugerida pela localização aproximada, ou null (permissão negada, indisponível, tempo esgotado ou fora do Brasil). */
export async function sugerirUfPelaLocalizacao(opcoes = {}) {
  return (await localizarUf(opcoes)).uf;
}
