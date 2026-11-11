// Сторонние библиотеки 3D-тура, собираемые в static/vendor/psv.js (глобальный объект RssmpPSV).
export { Viewer, events, utils, VERSION } from '@photo-sphere-viewer/core';
export { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';
import { Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Texture } from 'three';

export function addNadirBadge(viewer, badge, angularHalfWidth) {
  const distance = 8;
  const size = 2 * distance * angularHalfWidth;
  const texture = new Texture(badge);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  const logo = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  logo.rotation.x = -Math.PI / 2;
  logo.rotateZ(Math.PI);
  logo.position.y = -distance;
  // The badge must not consume clicks on the panorama.
  logo.raycast = () => {};
  viewer.renderer.addObject(logo);
  viewer.needsUpdate();
}
