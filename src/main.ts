import './style.css';
import { App } from './app';

const canvas = document.getElementById('c');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing #c canvas');

new App(canvas);
