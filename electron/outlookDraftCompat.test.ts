import { describe, expect, it } from 'vitest';
import {
  buildOutlook2019PowerShellScript,
  buildOutlook2019VbsScript,
} from './outlookDraftCompat';

const payload = {
  subject: 'Seguimiento huelga 17/03/2026',
  html: '<p>Línea 1</p>\n<p>Línea 2 con áéíóú</p>',
  to: ['responsable@metro.test'],
  cc: ['copia@metro.test'],
  bcc: [],
  attachments: [],
};

describe('Outlook 2019 compatibility scripts', () => {
  it('genera PowerShell compatible con EncodedCommand y conserva el adjunto', () => {
    const script = buildOutlook2019PowerShellScript(payload, ['C:\\Temp\\seguimiento.xlsx']);

    expect(script).toContain('Outlook.Application');
    expect(script).toContain('CreateItem(0)');
    expect(script).toContain('FromBase64String');
    expect(script).toContain('seguimiento.xlsx');
    expect(script).toContain('OK_DRAFT_DISPLAYED');
  });

  it('genera fallback VBS sin MSScriptControl y con HTML/adjunto desde fichero', () => {
    const script = buildOutlook2019VbsScript(
      payload,
      ['C:\\Temp\\seguimiento.xlsx'],
      'C:\\Temp\\body.html',
    );

    expect(script).toContain('ADODB.Stream');
    expect(script).not.toContain('MSScriptControl');
    expect(script).toContain('body.html');
    expect(script).toContain('seguimiento.xlsx');
    expect(script).toContain('Mail.Display');
  });
});
