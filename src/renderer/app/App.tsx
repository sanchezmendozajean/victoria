import { CanvasArea } from '../canvas/CanvasArea';
import { DialogHost } from '../components/DialogHost';
import { TooltipHost } from '../components/Tooltip';
import { ControlBar } from './ControlBar';
import { DocBar } from './DocBar';
import { PanelDock } from './PanelDock';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { Toolbar } from './Toolbar';
import { useAppEffects } from './useAppEffects';
import { useDocumentLifecycle } from './useDocumentLifecycle';
import './App.css';

export function App() {
  useAppEffects();
  useDocumentLifecycle();

  return (
    <div className="vc-app">
      <TitleBar />
      <ControlBar />
      <div className="vc-app__middle">
        <Toolbar />
        <div className="vc-app__work">
          <DocBar />
          <CanvasArea />
        </div>
        <PanelDock />
      </div>
      <StatusBar />
      <TooltipHost />
      <DialogHost />
    </div>
  );
}
