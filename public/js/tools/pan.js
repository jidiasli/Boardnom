/** The Hand tool. Panning itself is handled by the input router (same code as Space-drag / middle mouse). */
export class PanTool {
  constructor() { this.id = 'pan'; this.cursor = 'grab'; }
  onDown() {} onMove() {} onUp() {} onCancel() {}
}
