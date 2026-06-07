import traccionLogo from '../../assets/logo/traccion-logo.png';

interface AppBootScreenProps {
  message?: string;
}

export function AppBootScreen({ message = 'Inicializando sistema...' }: AppBootScreenProps) {
  return (
    <div className="app-boot-screen" aria-live="polite" aria-busy="true">
      <div className="app-boot-screen__card">
        <img className="app-boot-screen__logo" src={traccionLogo} alt="TrAccion" />
        <div className="app-boot-screen__title">TrAccion</div>
        <div className="app-boot-screen__subtitle">Relaciones Laborales</div>
        <div className="app-boot-screen__loader" aria-hidden="true" />
        <div className="app-boot-screen__message">{message}</div>
      </div>
    </div>
  );
}
