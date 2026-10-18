import { Fragment, useEffect, useRef } from 'react';
import type { AnswerCorrection } from './answerCorrection';

export default function CorrectionNotice({ correction }: { correction: Pick<AnswerCorrection, 'original' | 'marks' | 'message'> }) {
  const notice = useRef<HTMLElement>(null);
  useEffect(() => {
    notice.current?.focus({ preventScroll: true });
    notice.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [correction.original, correction.message]);
  let end = 0;
  const marks = [...correction.marks].sort((a, b) => a.start - b.start).filter((mark, index, all) => !index || mark.start !== all[index - 1].start || mark.end !== all[index - 1].end);
  return <section ref={notice} tabIndex={-1} className="answer-correction" role="status" aria-label="修改提示">
    <p>{correction.message}</p>
    {marks.length > 0 && <p className="correction-original" lang="en"><span className="correction-caption">上次答案：</span>{marks.map((mark, index) => {
      const before = correction.original.slice(end, mark.start); end = Math.max(end, mark.end);
      return <Fragment key={index}>{before}<mark aria-label={mark.start === mark.end ? '这里缺少内容' : '这里需要调整'}>{correction.original.slice(mark.start, mark.end) || '＿'}</mark></Fragment>;
    })}{correction.original.slice(end)}</p>}
  </section>;
}
