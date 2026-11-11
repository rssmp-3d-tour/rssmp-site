// Сторонние библиотеки 3D-тура, собираемые в static/vendor/psv.js (глобальный объект RssmpPSV).
export { Viewer, events, utils, VERSION } from '@photo-sphere-viewer/core';
export { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';
import { CanvasTexture, CircleGeometry, Mesh, MeshBasicMaterial, SRGBColorSpace } from 'three';

export function addNadirBadge(viewer, badge, angularRadius) {
  const distance = 8;
  const texture = new CanvasTexture(badge);
  texture.colorSpace = SRGBColorSpace;
  const disc = new Mesh(
    new CircleGeometry(distance * angularRadius, 64),
    new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.rotateZ(Math.PI);
  disc.position.y = -distance;
  // The badge must not consume clicks on the panorama.
  disc.raycast = () => {};
  viewer.renderer.addObject(disc);
  viewer.needsUpdate();
}
