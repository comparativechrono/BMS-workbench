// What the Anatomy tab uses of three.js, bundled by build/anatomy/build-three.sh into assets/vendor/three/three-anatomy.min.js
// (an IIFE that sets window.THREE).
export {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Vector2, Vector3, Box3, Sphere, Matrix4, Plane, Raycaster, Mesh, Group,
  MeshStandardMaterial, MeshBasicMaterial, DoubleSide, FrontSide, HemisphereLight, DirectionalLight, AmbientLight,
  BufferGeometry, BufferAttribute, SRGBColorSpace, NoToneMapping, MathUtils, MOUSE, TOUCH, Spherical, Quaternion
} from 'three';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
export { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
export const REVISION_NOTE = 'three.js r186 (0.186.1), MIT; meshoptimizer decoder, MIT';
