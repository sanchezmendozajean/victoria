import { CanvasArea } from '../canvas/CanvasArea';
import { DialogHost } from '../components/DialogHost';
import { TooltipHost } from '../components/Tooltip';
import { ControlBar } from './ControlBar';
import { DocBar } from './DocBar';
import { IsolationBar } from './IsolationBar';
import { PanelDock } from './PanelDock';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { CanvasContextMenu } from './CanvasContextMenu';
import { ColorPickerDialog } from './ColorPickerDialog';
import { SpacePropertiesDialog } from './SpacePropertiesDialog';
import { ModifierDialog } from './ModifierDialog';
import { PathTextDialog } from './PathTextDialog';
import { ExportDialog } from './ExportDialog';
import { PreferencesDialog } from './PreferencesDialog';
import { CustomDocumentDialog } from './CustomDocumentDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { StartScreen } from './StartScreen';
import { TextPromptHost } from './TextPrompt';
import { useDocuments } from '../documents';
import { PrintDialog } from './PrintDialog';
import { ShapeDialog } from './ShapeDialog';
import { TransformDialog } from './TransformDialog';
import { Toolbar } from './Toolbar';
import { useAppEffects } from './useAppEffects';
import { useDocumentLifecycle } from './useDocumentLifecycle';
import './App.css';

export function App() {
  useAppEffects();
  useDocumentLifecycle();
  const hasDocuments = useDocuments().documents.length > 0;

  return (
    <div className="vc-app">
      <TitleBar />
      <ControlBar />
      <div className="vc-app__middle">
        <Toolbar />
        <div className="vc-app__work">
          {hasDocuments ? (
            <>
              <DocBar />
              <IsolationBar />
              <CanvasArea />
            </>
          ) : (
            <StartScreen />
          )}
        </div>
        <PanelDock />
      </div>
      <StatusBar />
      <TooltipHost />
      <DialogHost />
      <TransformDialog />
      <ShapeDialog />
      <ExportDialog />
      <PrintDialog />
      <PreferencesDialog />
      <ShortcutsDialog />
      <CustomDocumentDialog />
      <TextPromptHost />
      <PathTextDialog />
      <ModifierDialog />
      <ColorPickerDialog />
      <SpacePropertiesDialog />
      <CanvasContextMenu />
    </div>
  );
}
