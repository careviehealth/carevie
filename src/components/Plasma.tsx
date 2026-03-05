"use client";

import { useRef, useEffect } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

const vertex = `#version 300 es
precision highp float;
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uCustomColor;
uniform float uUseCustomColor;
uniform float uSpeed;
uniform float uDirection;
uniform float uScale;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseInteractive;
out vec4 fragColor;

void mainImage(out vec4 o, vec2 C) {
  vec2 center = iResolution.xy * 0.5;
  C = (C - center) / uScale + center;
  vec2 mouseOffset = (uMouse - center) * 0.0002;
  C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);
  float i, d, z, T = iTime * uSpeed * uDirection;
  vec3 O, p, S;
  for (vec2 r = iResolution.xy, Q; ++i < 60.; O += o.w/d*o.xyz) {
    p = z*normalize(vec3(C-.5*r,r.y));
    p.z -= 4.;
    S = p;
    d = p.y-T;
    p.x += .4*(1.+p.y)*sin(d + p.x*0.1)*cos(.34*d + p.x*0.05);
    Q = p.xz *= mat2(cos(p.y+vec4(0,11,33,0)-T));
    z+= d = abs(sqrt(length(Q*Q)) - .25*(5.+S.y))/3.+8e-4;
    o = 1.+sin(S.y+p.z*.5+S.z-length(S-p)+vec4(2,1,0,8));
  }
  o.xyz = tanh(O/1e4);
}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  vec3 rgb = o.rgb;
  float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;
  vec3 finalColor = mix(rgb, intensity * uCustomColor, step(0.5, uUseCustomColor));
  fragColor = vec4(finalColor, length(rgb) * uOpacity);
}`;

export default function Plasma() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // performance: keep DPR capped
    const renderer = new Renderer({
      webgl: 2,
      alpha: true,
      dpr: Math.min(window.devicePixelRatio, 1.5),
    });

    const gl = renderer.gl;
    containerRef.current.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([0, 0]) },
        uCustomColor: { value: new Float32Array([0.08, 0.72, 0.65]) },
        uUseCustomColor: { value: 1.0 },
        uSpeed: { value: 0.24 },
        uDirection: { value: 1.0 },
        uScale: { value: 1.1 },
        uOpacity: { value: 0.8 },
        uMouse: { value: new Float32Array([0, 0]) },
        uMouseInteractive: { value: 1.0 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    const setSize = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      (program.uniforms.iResolution.value as Float32Array).set([
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
      ]);
    };

    setSize();
    window.addEventListener("resize", setSize);

    let raf = 0;
    let running = true;

    const onVis = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);

    const loop = (t: number) => {
      if (!running) return;
      program.uniforms.iTime.value = t * 0.001;
      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", setSize);
      try {
        containerRef.current?.removeChild(gl.canvas);
      } catch {}
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
}
