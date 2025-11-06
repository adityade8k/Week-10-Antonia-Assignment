// sequence.js
// Define your playlist and per-clip effects/params here.

const SEQUENCE = [
 
  { file: 'clips/4.mp4', effect: 'sobel',        params: { edge: 1.0 } }, //tree
  { file: 'clips/1.mp4', effect: 'compoundEyes', params: { cols: 20, rows: 20, offset: 1, lens: 0.4, jitter: 0, seed: 11 } }, 
  { file: 'clips/6.mp4', effect: 'threshold',    params: { t: 85 } }, //fish           // moved to threshold
  { file: 'clips/3.mp4', effect: 'posterize',    params: { levels: 15 } }, //watertank
  { file: 'clips/2.mp4', effect: 'videoGrid',    params: { cols: 7, rows: 7 } }, //motorcycles
  { file: 'clips/5.mp4', effect: 'pixelate',     params: { size: 8 } }, //rain

];

window.SEQUENCE = SEQUENCE;
