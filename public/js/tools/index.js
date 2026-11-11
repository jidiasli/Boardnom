import { SelectTool } from './select.js';
import { PanTool } from './pan.js';
import { PenTool } from './pen.js';
import { EraserTool } from './eraser.js';
import { ShapeTool } from './shape.js';
import { TextTool } from './text.js';

export function createTools(app) {
  const list = [
    new SelectTool(app),
    new PanTool(),
    new PenTool(app, 'pen'),
    new PenTool(app, 'highlighter'),
    new EraserTool(app),
    new ShapeTool(app, 'rect'),
    new ShapeTool(app, 'ellipse'),
    new ShapeTool(app, 'line'),
    new ShapeTool(app, 'arrow'),
    new TextTool(app, 'text'),
    new TextTool(app, 'sticky'),
  ];
  return Object.fromEntries(list.map((t) => [t.id, t]));
}
