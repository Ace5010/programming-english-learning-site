import Icon from './Icon';
import './speechControls.css';

export type PlaybackSpeed = 'normal' | 'slow';
export const playbackRates: Record<PlaybackSpeed, number> = { normal: 1, slow: 0.72 };

interface Props {
  speed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  voice?: 'aria' | 'guy';
  openVoice?: () => void;
}

export default function SpeechControls({ voice, openVoice }: Props) {
  return <div className="speech-controls">
    {openVoice && <button type="button" className="voice-button speech-voice" aria-label="语音设置" title={`语音设置：${voice === 'guy' ? 'Guy' : 'Aria'}`} onClick={openVoice}><Icon name="sound" /><span>语音设置</span><Icon name="chevron" /></button>}
  </div>;
}
