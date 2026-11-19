import { decode, encode } from 'fast-png';
import { staticFileUrl } from './fs_utils';

async function loadPart(name) {
  const url = staticFileUrl(`avatars/parts/${name}.png`);
  const bytes = await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url);
    request.responseType = 'arraybuffer';
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300 && request.response) {
        resolve(request.response);
      } else {
        reject(new Error(`Could not load avatar part ${name} (HTTP status ${request.status})`));
      }
    });
    request.addEventListener('error', () => reject(new Error(`Could not load avatar part ${name}`)));
    request.send();
  });
  const part = decode(bytes);
  if (part.depth !== 8 || part.channels !== 4) {
    throw new Error(`Avatar part ${name} must be an 8-bit RGBA PNG`);
  }
  return part;
}

const avatarColors = {
  body: [
    { r: 123, g: 67, b: 2 },
    { r: 196, g: 145, b: 53 },
    { r: 230, g: 198, b: 131 },
    { r: 255, g: 214, b: 92 },
    { r: 255, g: 228, b: 172 },
  ],
  eyes: [
    { r: 33, g: 33, b: 33 },
    { r: 5, g: 132, b: 255 },
    { r: 4, g: 150, b: 255 },
    { r: 71, g: 35, b: 1 },
    { r: 123, g: 143, b: 168 },
    { r: 2, g: 152, b: 2 },
  ],
  hair: [
    { r: 33, g: 33, b: 33 },
    { r: 88, g: 47, b: 1 },
    { r: 173, g: 133, b: 86 },
    { r: 6, g: 2, b: 255 },
    { r: 255, g: 64, b: 255 },
    { r: 255, g: 250, b: 165 },
    { r: 39, g: 17, b: 1 },
  ],
};

function overlayColor({ data }, { r, g, b }) {
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
  }
}

function composite(destination, layer) {
  if (layer.width !== destination.width || layer.height !== destination.height) {
    throw new Error('Avatar layers must have identical dimensions');
  }
  const source = layer.data;
  const target = destination.data;
  for (let offset = 0; offset < target.length; offset += 4) {
    const sourceAlpha = source[offset + 3] / 255;
    const targetAlpha = target[offset + 3] / 255;
    const alpha = targetAlpha + sourceAlpha - targetAlpha * sourceAlpha;
    for (let channel = offset; channel < offset + 3; channel += 1) {
      // Keep the original normalized source-over calculation and byte
      // truncation so existing avatars retain the same pixel values.
      const sourceColor = source[channel] / 255;
      const targetColor = target[channel] / 255;
      const color = alpha === 0 ? 0
        : (sourceColor * sourceAlpha + targetColor * targetAlpha * (1 - sourceAlpha)) / alpha;
      target[channel] = Math.min(255, color * 255);
    }
    target[offset + 3] = Math.min(255, alpha * 255);
  }
}

export const NUM_FEATURES = {
  sc: avatarColors.body.length,
  ec: avatarColors.eyes.length + 1, // extra for glasses option
  hc: avatarColors.hair.length,
  hs: 6 + 1, // extra for no hair option
};

export async function generateDataURI({ ec, hs, sc, hc }, callback) {
  const glasses = ec === NUM_FEATURES.ec - 1;
  const hasHair = hs !== NUM_FEATURES.hs - 1;
  const names = ['body', 'face', 'onesie', glasses ? 'glasses' : 'eyes'];
  if (hasHair) {
    names.push(`hair${hs}`);
    if ([2, 3, 4, 5].includes(hs)) names.push(`hair${hs}_overlay`);
  }

  const [body, ...layers] = await Promise.all(names.map(loadPart));
  overlayColor(body, avatarColors.body[sc]);
  if (!glasses) overlayColor(layers[2], avatarColors.eyes[ec]);
  if (hasHair) overlayColor(layers[3], avatarColors.hair[hc]);

  for (const layer of layers) composite(body, layer);

  const bytes = encode({ width: body.width, height: body.height, data: body.data, channels: 4 });
  const base64 = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
  const uri = `data:image/png;base64,${base64}`;
  callback(uri);
  return uri;
}
