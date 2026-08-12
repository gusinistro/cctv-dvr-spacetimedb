import { useEffect, useRef } from "react";
import type { Camera } from "@/lib/cctv/types";

type Props = { camera: Camera; compact?: boolean; onClick?: () => void };

export function CctvFrame({ camera, compact = false, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let raf = 0;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = rect.width;
      const height = rect.height;
      const time = new Date();
      const pulse = (Math.sin(frame / 28) + 1) / 2;
      const isNight = camera.scene === "night";

      const background = context.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, isNight ? "#071321" : "#183b4c");
      background.addColorStop(0.55, isNight ? "#102333" : "#4d776a");
      background.addColorStop(1, isNight ? "#071018" : "#182a27");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.fillStyle = isNight ? "rgba(204, 233, 255, 0.08)" : "rgba(255, 255, 239, 0.18)";
      context.beginPath();
      context.arc(width * 0.74, height * 0.22, Math.max(16, width * 0.075), 0, Math.PI * 2);
      context.fill();

      context.fillStyle = isNight ? "#0c1d26" : "#294940";
      context.beginPath();
      context.moveTo(0, height * 0.68);
      context.lineTo(width * 0.25, height * 0.48);
      context.lineTo(width * 0.44, height * 0.64);
      context.lineTo(width * 0.68, height * 0.38);
      context.lineTo(width, height * 0.59);
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.fill();

      context.fillStyle = isNight ? "#132b31" : "#182f2e";
      context.fillRect(width * 0.12, height * 0.43, width * 0.19, height * 0.33);
      context.fillRect(width * 0.56, height * 0.31, width * 0.16, height * 0.44);
      context.fillStyle = isNight ? "#d9c27a" : "#c4d9bc";
      for (let index = 0; index < 8; index += 1) {
        const x = width * 0.14 + (index % 3) * width * 0.057;
        const y = height * 0.49 + Math.floor(index / 3) * height * 0.09;
        context.fillRect(x, y, width * 0.025, height * 0.032);
      }

      const personX = (width * 0.12) + ((frame % 280) / 280) * width * 0.72;
      const personY = height * 0.71;
      context.fillStyle = camera.motion ? "#ffbf72" : "rgba(9, 20, 23, 0.88)";
      context.beginPath();
      context.arc(personX, personY - 19, 5, 0, Math.PI * 2);
      context.fill();
      context.fillRect(personX - 4, personY - 14, 8, 15);
      context.fillRect(personX - 7, personY, 4, 11);
      context.fillRect(personX + 3, personY, 4, 11);

      context.fillStyle = "rgba(1, 8, 12, 0.2)";
      for (let y = 0; y < height; y += 5) context.fillRect(0, y, width, 1);
      context.fillStyle = `rgba(136, 248, 207, ${0.08 + pulse * 0.05})`;
      context.fillRect(0, (frame * 1.8) % height, width, 1);

      if (camera.motion) {
        context.strokeStyle = `rgba(255, 189, 104, ${0.65 + pulse * 0.3})`;
        context.lineWidth = 1.5;
        context.setLineDash([5, 4]);
        context.strokeRect(personX - 18, personY - 37, 36, 51);
        context.setLineDash([]);
      }

      if (camera.status === "offline") {
        context.fillStyle = "rgba(2, 8, 12, 0.72)";
        context.fillRect(0, 0, width, height);
        context.textAlign = "center";
        context.fillStyle = "#d1d9d5";
        context.font = `600 ${Math.max(12, width / 17)}px ui-sans-serif`;
        context.fillText("SINAL INDISPONÍVEL", width / 2, height / 2);
      }

      context.textAlign = "left";
      context.fillStyle = "rgba(2, 10, 13, 0.72)";
      context.fillRect(12, 12, Math.min(width - 24, 188), compact ? 37 : 48);
      context.fillStyle = camera.status === "online" ? "#9ff2c9" : "#ff9a94";
      context.beginPath();
      context.arc(25, 26, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#eef6f4";
      context.font = `600 ${compact ? 10 : 12}px ui-sans-serif`;
      context.fillText(camera.name.toUpperCase(), 36, 30);
      context.fillStyle = "rgba(238,246,244,.68)";
      context.font = `${compact ? 9 : 10}px ui-monospace`;
      context.fillText(time.toLocaleString("pt-BR", { hour12: false }), 18, compact ? 42 : 53);

      if (!compact) {
        context.textAlign = "right";
        context.fillStyle = "rgba(2, 10, 13, 0.72)";
        context.fillRect(width - 96, height - 32, 84, 20);
        context.fillStyle = "#d9e8e3";
        context.font = "10px ui-monospace";
        context.fillText(camera.protocol + " • HD", width - 18, height - 18);
      }

      frame += 1;
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [camera, compact]);

  return (
    <button className="camera-frame" onClick={onClick} type="button" aria-label={`Abrir câmera ${camera.name}`}>
      <canvas ref={canvasRef} />
      {camera.motion && <span className="motion-chip">MOVIMENTO</span>}
    </button>
  );
}
