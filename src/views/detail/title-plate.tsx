import { useEffect, useState } from "react";

function LogoImage({ url, title, onFailed }: { url: string; title: string; onFailed: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={url}
      alt={title}
      decoding="async"
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) setLoaded(true);
      }}
      onLoad={() => setLoaded(true)}
      onError={onFailed}
      className={`absolute bottom-0 start-0 max-h-[124px] w-auto max-w-[440px] object-contain object-left rtl:object-right drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)] transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}

export function TitlePlate({ title, logo, loading }: { title: string; logo?: string; loading: boolean }) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  const hasLogo = !!logo && !logoFailed;

  if (loading && !hasLogo) return <div className="min-h-[120px]" />;

  return (
    <div className="relative flex min-h-[120px] flex-col justify-end">
      <h1
        className={`font-display text-[80px] font-medium leading-[0.95] tracking-tight text-ink transition-opacity duration-500 ${hasLogo ? "opacity-0" : "opacity-100"}`}
      >
        {title}
      </h1>
      {hasLogo && logo && (
        <LogoImage key={logo} url={logo} title={title} onFailed={() => setLogoFailed(true)} />
      )}
    </div>
  );
}
