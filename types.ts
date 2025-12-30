export enum ShapeMode {
  FREEHAND = 'FREEHAND',
  CIRCLE = 'CIRCLE',
  RECTANGLE = 'RECTANGLE',
  TRIANGLE = 'TRIANGLE',
  LINE = 'LINE',
  DIAMOND = 'DIAMOND',
  HEART = 'HEART'
}

export interface Point {
  x: number;
  y: number;
}

export interface DrawingPath {
  points: Point[];
  color: string;
  width: number;
  type: ShapeMode;
  timestamp: number;
  wobbleSeed?: number; // For organic feel
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}