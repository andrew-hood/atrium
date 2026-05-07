import {
  Geometry2d,
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  TLResizeInfo,
  resizeBox,
} from 'tldraw';
import { SessionStickyComponent } from './SessionStickyComponent';
import {
  SESSION_STICKY_TYPE,
  sessionStickyShapeMigrations,
  sessionStickyShapeRecordProps,
  type SessionStickyShape,
} from './SessionStickyShape';

export class SessionStickyUtil extends ShapeUtil<SessionStickyShape> {
  static override type = SESSION_STICKY_TYPE;
  static override props = sessionStickyShapeRecordProps;
  static override migrations = sessionStickyShapeMigrations;

  override canEdit() {
    return false;
  }

  override canResize() {
    return true;
  }

  override isAspectRatioLocked() {
    return false;
  }

  override getDefaultProps(): SessionStickyShape['props'] {
    return {
      w: 330,
      h: 230,
      sessionId: '',
      label: 'Agent session',
      transcriptPath: '',
      recentPrompt: '',
      lastResponse: '',
      state: 'running',
      cwd: '',
      pid: 0,
      tty: '',
      lastAction: 'Session started',
      lastEvent: 'SessionStart',
      createdAt: '',
      updatedAt: '',
      stateChangedAt: '',
      endedAt: '',
      thoughts: '',
      closed: false,
    };
  }

  override getGeometry(shape: SessionStickyShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: SessionStickyShape, info: TLResizeInfo<SessionStickyShape>) {
    return resizeBox(shape, info);
  }

  override component(shape: SessionStickyShape) {
    return (
      <HTMLContainer id={shape.id} style={{ pointerEvents: 'all' }}>
        <SessionStickyComponent shape={shape} />
      </HTMLContainer>
    );
  }

  backgroundComponent(shape: SessionStickyShape) {
    if (shape.parentId.startsWith('page:')) {
      return null;
    }

    const className = [
      'session-sticky__surface',
      shape.props.state === 'running' && 'session-sticky__surface--running',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <HTMLContainer style={{ pointerEvents: 'none' }}>
        <div className={className} style={{ width: shape.props.w, height: shape.props.h }} />
      </HTMLContainer>
    );
  }

  override indicator(shape: SessionStickyShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}
