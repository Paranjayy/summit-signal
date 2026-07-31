import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Float, Html, Sparkles, Stars } from '@react-three/drei'
import * as THREE from 'three'
import './styles.css'
import { biomeLabels, CARD_POOL, DEFAULT_MODIFIERS, getBiome, getModeLabel, mergeModifiers, type BiomeId, type RunMode, type RunModifiers, type SignalCard } from './gameData'

type Platform = { x: number; y: number; z: number; width: number; depth: number; kind: 'scaffold' | 'sign' | 'container' | 'cloud' | 'moving'; sway?: number }
type SignalShard = { x: number; y: number; z: number }
type SignalGate = { x: number; y: number; z: number; radius: number }
type SignalArtifact = { x: number; y: number; z: number; label: string }
type GhostFrame = { t: number; x: number; y: number; z: number }
const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0')
  const tenths = Math.floor((seconds % 1) * 10)
  return `${minutes}:${remainder}.${tenths}`
}

type AudioCue = 'land' | 'shard' | 'gate' | 'burst' | 'checkpoint' | 'fail' | 'finish'

const cuePattern: Record<AudioCue, { notes: number[]; duration: number; type: OscillatorType; volume: number }> = {
  land: { notes: [164], duration: .08, type: 'triangle', volume: .028 },
  shard: { notes: [392, 587], duration: .11, type: 'sine', volume: .035 },
  gate: { notes: [261, 392, 659], duration: .13, type: 'square', volume: .028 },
  burst: { notes: [220, 330], duration: .09, type: 'sawtooth', volume: .024 },
  checkpoint: { notes: [196, 294, 440], duration: .16, type: 'triangle', volume: .032 },
  fail: { notes: [130, 98], duration: .16, type: 'sine', volume: .032 },
  finish: { notes: [262, 330, 392, 523], duration: .18, type: 'triangle', volume: .036 },
}

const playCue = (context: AudioContext | null, cue: AudioCue) => {
  if (!context) return
  const pattern = cuePattern[cue]
  const now = context.currentTime
  pattern.notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = now + index * pattern.duration * .72
    oscillator.type = pattern.type
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(.0001, start)
    gain.gain.exponentialRampToValueAtTime(pattern.volume, start + .012)
    gain.gain.exponentialRampToValueAtTime(.0001, start + pattern.duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + pattern.duration + .02)
  })
}

const starterPlatforms: Platform[] = [
  { x: 0, y: 0, z: 0, width: 7, depth: 7, kind: 'scaffold' },
  { x: -2.8, y: 2.5, z: -1.3, width: 3.2, depth: 3, kind: 'container' },
  { x: 1.4, y: 4.9, z: -3.1, width: 3.4, depth: 2.6, kind: 'sign' },
  { x: 4.1, y: 7.5, z: -4.5, width: 2.8, depth: 3, kind: 'scaffold' },
  { x: 0.6, y: 10.1, z: -5.6, width: 3.6, depth: 2.4, kind: 'container' },
  { x: -3.3, y: 12.8, z: -6.8, width: 3.4, depth: 3.2, kind: 'cloud' },
  { x: -0.9, y: 15.6, z: -8.1, width: 3.2, depth: 2.6, kind: 'sign' },
  { x: 3.2, y: 18.5, z: -9.4, width: 3.8, depth: 2.7, kind: 'scaffold' },
  { x: 0, y: 21.5, z: -10.8, width: 4.8, depth: 3.5, kind: 'cloud' },
]

const extendedPlatforms: Platform[] = Array.from({ length: 30 }, (_, index) => {
  const y = 23.9 + index * 2.55
  const x = Math.sin(index * 1.47) * 4.2
  const z = -12.1 - index * 1.45
  const kinds: Platform['kind'][] = ['scaffold', 'container', 'sign', 'cloud', 'moving']
  const kind = kinds[index % kinds.length]
  return { x, y, z, width: 3.1 + (index % 3) * .45, depth: 2.7 + (index % 2) * .45, kind, sway: kind === 'moving' ? (index % 2 ? 1.45 : -1.45) : undefined }
})

const platforms: Platform[] = [...starterPlatforms, ...extendedPlatforms]
const courseHeight = platforms[platforms.length - 1].y + 1.2
const platformXAt = (platform: Platform, time: number) => platform.x + (platform.sway ? Math.sin(time * 1.15 + platform.y * .23) * platform.sway : 0)

const signalShards: SignalShard[] = [
  { x: -2.8, y: 3.75, z: -1.3 },
  { x: 1.4, y: 6.05, z: -3.1 },
  { x: 0.6, y: 11.2, z: -5.6 },
  { x: -0.9, y: 16.9, z: -8.1 },
  { x: 0, y: 22.6, z: -10.8 },
]

const signalGates: SignalGate[] = [
  { x: 0, y: 18, z: -13, radius: 5.5 },
  { x: 0, y: 41, z: -38, radius: 5.8 },
  { x: 0, y: 64, z: -63, radius: 6.1 },
  { x: 0, y: 87, z: -88, radius: 6.4 },
]

const signalArtifacts: SignalArtifact[] = [
  { x: 4.2, y: 26.7, z: -13.6, label: 'RUST KEY' },
  { x: -4.2, y: 39.4, z: -20.8, label: 'NIGHT KEY' },
  { x: 4.4, y: 52.2, z: -28.1, label: 'CLOUD KEY' },
  { x: -4.3, y: 65, z: -35.4, label: 'VOID KEY' },
  { x: 4.1, y: 77.8, z: -42.7, label: 'SUN KEY' },
  { x: -3.7, y: 90.6, z: -49.9, label: 'CORE KEY' },
]

function PlatformMesh({ platform }: { platform: Platform }) {
  const group = useRef<THREE.Group>(null)
  useFrame((state) => { if (group.current && platform.sway) group.current.position.x = platform.x + Math.sin(state.clock.elapsedTime * 1.15 + platform.y * .23) * platform.sway })
  const color = platform.kind === 'container' ? '#b74727' : platform.kind === 'sign' ? '#d7ad47' : platform.kind === 'cloud' ? '#dfe6e3' : platform.kind === 'moving' ? '#3e8f98' : '#6b5f49'
  return <group ref={group} position={[platform.x, platform.y, platform.z]}>
    <mesh castShadow receiveShadow position={[0, -0.2, 0]}>
      <boxGeometry args={[platform.width, 0.4, platform.depth]} />
      <meshStandardMaterial color={color} roughness={platform.kind === 'cloud' ? 0.95 : 0.64} metalness={platform.kind === 'scaffold' ? 0.7 : 0.08} />
    </mesh>
    {(platform.kind === 'scaffold' || platform.kind === 'moving') && [-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} castShadow position={[sx * (platform.width / 2 - .18), -1.1, sz * (platform.depth / 2 - .18)]}><cylinderGeometry args={[.08, .08, 1.8, 8]} /><meshStandardMaterial color={platform.kind === 'moving' ? '#224d54' : '#312c23'} metalness={.85} roughness={.3} /></mesh>))}
    {platform.kind === 'sign' && <mesh castShadow position={[0, .85, 0]} rotation={[0, .18, 0]}><boxGeometry args={[platform.width * .8, 1.3, .12]} /><meshStandardMaterial color="#f1c24d" emissive="#7b4b0b" emissiveIntensity={.35} /></mesh>}
    {platform.kind === 'cloud' && <><mesh position={[-.8, .25, 0]}><sphereGeometry args={[.85, 16, 12]} /><meshStandardMaterial color="#f6f4ea" roughness={1} /></mesh><mesh position={[.65, .2, .15]}><sphereGeometry args={[1.08, 16, 12]} /><meshStandardMaterial color="#f6f4ea" roughness={1} /></mesh></>}
  </group>
}

function SignalShardMesh({ shard, collected }: { shard: SignalShard; collected: boolean }) {
  if (collected) return null
  return <Float speed={2.2} rotationIntensity={.6} floatIntensity={.45} position={[shard.x, shard.y, shard.z]}>
    <mesh castShadow><octahedronGeometry args={[.24, 0]} /><meshStandardMaterial color="#ec4f2d" emissive="#9f2817" emissiveIntensity={1.2} metalness={.75} roughness={.22} /></mesh>
  </Float>
}

function SignalArtifactMesh({ artifact, collected }: { artifact: SignalArtifact; collected: boolean }) {
  if (collected) return null
  return <Float speed={1.4} rotationIntensity={.9} floatIntensity={.6} position={[artifact.x, artifact.y, artifact.z]}>
    <group>
      <mesh castShadow><dodecahedronGeometry args={[.33, 0]} /><meshStandardMaterial color="#6fd1cf" emissive="#287f82" emissiveIntensity={1.2} metalness={.75} roughness={.2} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.55, .025, 8, 24]} /><meshStandardMaterial color="#9af2e8" emissive="#4bc5c2" emissiveIntensity={1.4} transparent opacity={.8} /></mesh>
    </group>
  </Float>
}

function WorldBackdrop({ mode }: { mode: RunMode }) {
  const stormline = mode === 'stormline'
  const zenith = mode === 'zenith'
  const sunColor = stormline ? '#ef6c4d' : zenith ? '#b9dcff' : '#f1c171'
  const skylineColor = stormline ? '#26343d' : zenith ? '#40566b' : '#313d42'
  const skyline = useMemo(() => Array.from({ length: 14 }, (_, index) => ({ x: (index % 2 ? 1 : -1) * (16 + (index % 5) * 4), y: 7 + (index % 4) * 3.5, z: -18 - index * 6, width: 2.5 + (index % 3) * 1.3, depth: 2.2 + (index % 2), height: 12 + (index % 5) * 5 })), [])
  const gates = useMemo(() => Array.from({ length: 4 }, (_, index) => ({ y: 18 + index * 23, z: -13 - index * 25, color: index % 2 ? '#d7ad47' : '#b63a23' })), [])
  return <group>
    <mesh position={[0, 92, -150]}><sphereGeometry args={[12, 24, 16]} /><meshStandardMaterial color={sunColor} emissive={stormline ? '#a51f2d' : zenith ? '#6f9fe8' : '#b85b2e'} emissiveIntensity={.5} roughness={1} /></mesh>
    {skyline.map((tower, index) => <group key={`tower-${index}`} position={[tower.x, tower.y, tower.z]}>
      <mesh castShadow><boxGeometry args={[tower.width, tower.height, tower.depth]} /><meshStandardMaterial color={index % 3 === 0 ? skylineColor : (stormline ? '#3e4047' : zenith ? '#52687a' : '#46504c')} roughness={.85} metalness={.3} /></mesh>
      <mesh position={[0, tower.height / 2 + 1.5, 0]}><cylinderGeometry args={[.05, .05, 3, 6]} /><meshStandardMaterial color="#d7ad47" emissive="#d7ad47" emissiveIntensity={.7} /></mesh>
      {[-1, 0, 1].map((windowIndex) => <mesh key={windowIndex} position={[windowIndex * .48, 0, tower.depth / 2 + .02]}><boxGeometry args={[.22, .12, .04]} /><meshStandardMaterial color="#e9b957" emissive="#e9b957" emissiveIntensity={1.3} /></mesh>)}
    </group>)}
    {[-1, 1].map((side) => <mesh key={side} position={[side * 31, 7, -62]} rotation={[0, 0, side * .22]}><coneGeometry args={[18, 34, 5]} /><meshStandardMaterial color="#35443f" roughness={1} /></mesh>)}
    {gates.map((gate, index) => <group key={`gate-${index}`} position={[0, gate.y, gate.z]} rotation={[0, index * .12, 0]}>
      <mesh><torusGeometry args={[5.5 + index * .35, .12, 12, 48]} /><meshStandardMaterial color={gate.color} emissive={gate.color} emissiveIntensity={.65} metalness={.55} roughness={.28} /></mesh>
      <mesh position={[0, -5.2, 0]}><boxGeometry args={[.18, 10.4, .18]} /><meshStandardMaterial color="#303b3a" metalness={.7} roughness={.35} /></mesh>
    </group>)}
  </group>
}

function EchoRunner({ path, active, runId }: { path: GhostFrame[]; active: boolean; runId: number }) {
  const ghost = useRef<THREE.Group>(null)
  const playbackTime = useRef(0)
  const cursor = useRef(0)
  useEffect(() => { playbackTime.current = 0; cursor.current = 0 }, [runId, path])
  useFrame((_, delta) => {
    if (!ghost.current || !active || path.length < 2) return
    playbackTime.current = Math.min(path[path.length - 1].t, playbackTime.current + Math.min(delta, .04))
    while (cursor.current < path.length - 2 && path[cursor.current + 1].t < playbackTime.current) cursor.current += 1
    const from = path[cursor.current]
    const to = path[Math.min(path.length - 1, cursor.current + 1)]
    const span = Math.max(.001, to.t - from.t)
    const blend = THREE.MathUtils.clamp((playbackTime.current - from.t) / span, 0, 1)
    ghost.current.position.set(THREE.MathUtils.lerp(from.x, to.x, blend), THREE.MathUtils.lerp(from.y, to.y, blend), THREE.MathUtils.lerp(from.z, to.z, blend))
    ghost.current.rotation.y = Math.atan2(to.x - from.x, -(to.z - from.z))
  })
  if (path.length < 2) return null
  return <group ref={ghost} position={[path[0].x, path[0].y, path[0].z]}>
    <mesh position={[0, .56, 0]}><capsuleGeometry args={[.25, .68, 6, 12]} /><meshStandardMaterial color="#74d8db" emissive="#3cbac1" emissiveIntensity={1.4} transparent opacity={.36} depthWrite={false} /></mesh>
    <mesh position={[0, 1.12, 0]}><sphereGeometry args={[.28, 16, 10]} /><meshStandardMaterial color="#c9ffff" emissive="#74d8db" emissiveIntensity={1.5} transparent opacity={.42} depthWrite={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .02, 0]}><torusGeometry args={[.62, .035, 8, 32]} /><meshStandardMaterial color="#74d8db" emissive="#3cbac1" emissiveIntensity={1.3} transparent opacity={.42} depthWrite={false} /></mesh>
  </group>
}

function Player({ running, mode, modifiers, onProgress, onFall, onCollect, onArtifact, onGate, onGhostFrame, onLand, onBurst, onCheckpoint, onViewChange, onComplete }: { running: boolean; mode: RunMode; modifiers: RunModifiers; onProgress: (height: number) => void; onFall: () => boolean; onCollect: (index: number) => void; onArtifact: (index: number) => void; onGate: (index: number) => void; onGhostFrame: (frame: GhostFrame) => void; onLand: () => void; onBurst: () => void; onCheckpoint: (height: number) => void; onViewChange: (view: 'third' | 'first') => void; onComplete: () => void }) {
  const body = useRef<THREE.Group>(null)
  const velocity = useRef(new THREE.Vector3(0, 0, 0))
  const position = useRef(new THREE.Vector3(0, .34, 0))
  const keys = useRef<Record<string, boolean>>({})
  const nextReport = useRef(0)
  const claimedShards = useRef(new Set<number>())
  const claimedGates = useRef(new Set<number>())
  const claimedArtifacts = useRef(new Set<number>())
  const grounded = useRef(true)
  const yaw = useRef(.28)
  const pitch = useRef(.12)
  const viewMode = useRef<'third' | 'first'>('third')
  const dragging = useRef(false)
  const previousPointer = useRef({ x: 0, y: 0 })
  const completedRun = useRef(false)
  const burstCooldown = useRef(0)
  const burstLatch = useRef(false)
  const runClock = useRef(0)
  const nextGhostSample = useRef(0)
  const checkpoint = useRef(new THREE.Vector3(0, .34, 0))
  const reset = (toCheckpoint = false) => { position.current.copy(toCheckpoint ? checkpoint.current : new THREE.Vector3(0, .34, 0)); velocity.current.set(0, 0, 0); grounded.current = true; burstCooldown.current = 0; burstLatch.current = false }

  useEffect(() => {
    const down = (event: KeyboardEvent) => { const key = event.key.toLowerCase(); const code = event.code.toLowerCase(); keys.current[key] = true; keys.current[code] = true; if (key === 'r') reset(); if (key === 'c') { yaw.current = .28; pitch.current = .12 } if (key === 'v' && !event.repeat) { viewMode.current = viewMode.current === 'third' ? 'first' : 'third'; onViewChange(viewMode.current) } }
    const up = (event: KeyboardEvent) => { const key = event.key.toLowerCase(); const code = event.code.toLowerCase(); keys.current[key] = false; keys.current[code] = false }
    const clearKeys = () => { keys.current = {} }
    const canvas = document.querySelector('canvas')
    const handlePointerDown = (event: PointerEvent) => { dragging.current = true; previousPointer.current = { x: event.clientX, y: event.clientY }; if (document.pointerLockElement !== canvas) canvas?.requestPointerLock?.() }
    const handlePointerUp = () => { dragging.current = false }
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragging.current && document.pointerLockElement !== canvas) return
      const dx = document.pointerLockElement === canvas ? event.movementX : event.clientX - previousPointer.current.x
      const dy = document.pointerLockElement === canvas ? event.movementY : event.clientY - previousPointer.current.y
      previousPointer.current = { x: event.clientX, y: event.clientY }
      yaw.current -= dx * .0026
      pitch.current = THREE.MathUtils.clamp(pitch.current - dy * .0022, -.5, .72)
    }
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', clearKeys); addEventListener('visibilitychange', clearKeys); canvas?.addEventListener('pointerdown', handlePointerDown); addEventListener('pointerup', handlePointerUp); addEventListener('mousemove', handleMouseMove)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', clearKeys); removeEventListener('visibilitychange', clearKeys); canvas?.removeEventListener('pointerdown', handlePointerDown); removeEventListener('pointerup', handlePointerUp); removeEventListener('mousemove', handleMouseMove) }
  }, [onViewChange])

  useEffect(() => {
    checkpoint.current.set(0, .34, 0)
    reset()
    keys.current = {}
    completedRun.current = false
    claimedGates.current = new Set()
    claimedArtifacts.current = new Set()
    viewMode.current = 'third'
    runClock.current = 0
    nextGhostSample.current = 0
  }, [running])

  useFrame((state, delta) => {
    if (!body.current || !running) return
    const dt = Math.min(delta, .04)
    runClock.current += dt
    const steer = (Number(Boolean(keys.current.d || keys.current.arrowright)) - Number(Boolean(keys.current.a || keys.current.arrowleft)))
    const pace = (Number(Boolean(keys.current.w || keys.current.arrowup || keys.current.keyw)) - Number(Boolean(keys.current.s || keys.current.arrowdown || keys.current.keys)))
    const wantsJump = Boolean(keys.current[' '] || keys.current.space || keys.current.spacebar)
    const wantsBurst = Boolean(keys.current.shift || keys.current.shiftleft || keys.current.shiftright)
    // Movement follows the camera's horizontal heading, as expected in a third-person game.
    const targetX = -Math.sin(yaw.current) * pace * 3.8 * modifiers.speedMultiplier + Math.cos(yaw.current) * steer * (5.1 + modifiers.airControlBonus)
    const targetZ = -Math.cos(yaw.current) * pace * 3.8 * modifiers.speedMultiplier - Math.sin(yaw.current) * steer * (5.1 + modifiers.airControlBonus)
    velocity.current.x = pace === 0 && steer === 0 ? 0 : THREE.MathUtils.damp(velocity.current.x, targetX, 10, dt)
    velocity.current.z = pace === 0 && steer === 0 ? 0 : THREE.MathUtils.damp(velocity.current.z, targetZ, 10, dt)
    burstCooldown.current = Math.max(0, burstCooldown.current - dt)
    if (!wantsBurst) burstLatch.current = false
    if (wantsBurst && !burstLatch.current && burstCooldown.current <= 0) {
      const burstDirection = new THREE.Vector3(targetX, 0, targetZ)
      if (burstDirection.lengthSq() < .01) burstDirection.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
      burstDirection.normalize()
      velocity.current.addScaledVector(burstDirection, 8.2)
      velocity.current.y = Math.max(velocity.current.y, 3.1 * modifiers.burstLiftMultiplier)
      grounded.current = false
      burstCooldown.current = 2.6 * modifiers.burstCooldownMultiplier
      burstLatch.current = true
      onBurst()
    }
    const windScale = (mode === 'stormline' ? 1.65 : mode === 'zenith' ? 1.15 : 1) * modifiers.windMultiplier
    const crosswind = Math.sin(state.clock.elapsedTime * 1.4 + position.current.y * .16) * (.08 + Math.min(1, position.current.y / courseHeight) * .5) * windScale
    velocity.current.x += crosswind * dt
    if (grounded.current) {
      const supported = platforms.some((p) => { const platformX = platformXAt(p, state.clock.elapsedTime); return Math.abs(position.current.y - (p.y + .34)) < .08 && Math.abs(position.current.x - platformX) < p.width / 2 + .12 && Math.abs(position.current.z - p.z) < p.depth / 2 + .12 })
      if (!supported) { grounded.current = false; velocity.current.y = -.6 }
    }
    if (wantsJump && grounded.current) { velocity.current.y = 9.6; grounded.current = false }
    if (!grounded.current) velocity.current.y -= (mode === 'stormline' ? 14.8 : mode === 'zenith' ? 13.2 : 13.8) * modifiers.gravityMultiplier * dt
    const previousY = position.current.y
    position.current.addScaledVector(velocity.current, dt)
    if (!grounded.current && velocity.current.y < 0) {
      for (const p of platforms) {
        const crossedTop = previousY >= p.y + .18 && position.current.y <= p.y + .34
        const nearLedge = position.current.y <= p.y + .55 && position.current.y >= p.y - .75
        const platformX = platformXAt(p, state.clock.elapsedTime)
        const withinX = Math.abs(position.current.x - platformX) < p.width / 2 + .55
        const withinZ = Math.abs(position.current.z - p.z) < p.depth / 2 + .55
        const onTop = crossedTop || nearLedge
        if (onTop && withinX && withinZ) {
          position.current.y = p.y + .34; position.current.x = platformX; velocity.current.y = 0; grounded.current = true; onLand()
          if (p.y > checkpoint.current.y + 7) { checkpoint.current.set(platformX, p.y + .34, p.z); onCheckpoint(p.y) }
          break
        }
      }
    }
    if (position.current.y < -5) { const forgiven = onFall(); reset(true); if (forgiven) setTimeout(() => onProgress(Math.max(0, checkpoint.current.y)), 0) }
    body.current.position.copy(position.current)
    if (runClock.current >= nextGhostSample.current) { onGhostFrame({ t: runClock.current, x: position.current.x, y: position.current.y, z: position.current.z }); nextGhostSample.current = runClock.current + .08 }
    body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, -velocity.current.x * .05, 5, dt)
    if (Math.abs(velocity.current.x) + Math.abs(velocity.current.z) > .08) body.current.rotation.y = THREE.MathUtils.damp(body.current.rotation.y, Math.atan2(velocity.current.x, -velocity.current.z), 10, dt)
    // Keep the lens on the playable lane. The avatar can drift through the
    // level's depth, but the camera must never follow it into the void after a miss.
    if (viewMode.current === 'first') {
      body.current.visible = false
      const eye = new THREE.Vector3(position.current.x, position.current.y + 1.22, position.current.z)
      const forward = new THREE.Vector3(-Math.sin(yaw.current), Math.sin(pitch.current) * .7, -Math.cos(yaw.current))
      state.camera.position.lerp(eye, .28)
      state.camera.lookAt(eye.clone().add(forward.multiplyScalar(8)))
    } else {
      body.current.visible = true
      const lookTarget = new THREE.Vector3(position.current.x * .25, Math.max(1.4, position.current.y + 1.45), position.current.z - 2.6)
      const cameraDistance = 15.5
      const cameraOffset = new THREE.Vector3(Math.sin(yaw.current) * cameraDistance, 5.1 + Math.sin(pitch.current) * 5.5, Math.cos(yaw.current) * cameraDistance)
      state.camera.position.lerp(lookTarget.clone().add(cameraOffset), .1)
      state.camera.lookAt(lookTarget)
    }
    signalShards.forEach((shard, index) => {
      if (!claimedShards.current.has(index) && position.current.distanceTo(new THREE.Vector3(shard.x, shard.y, shard.z)) < modifiers.pickupRadius) {
        claimedShards.current.add(index)
        onCollect(index)
      }
    })
    signalGates.forEach((gate, index) => {
      if (!claimedGates.current.has(index) && Math.abs(position.current.y - gate.y) < 2.8 && Math.hypot(position.current.x - gate.x, position.current.z - gate.z) < gate.radius) {
        claimedGates.current.add(index)
        onGate(index)
      }
    })
    signalArtifacts.forEach((artifact, index) => {
      if (!claimedArtifacts.current.has(index) && position.current.distanceTo(new THREE.Vector3(artifact.x, artifact.y, artifact.z)) < 1.15) {
        claimedArtifacts.current.add(index)
        onArtifact(index)
      }
    })
    if (!completedRun.current && position.current.y >= courseHeight - 1.5) { completedRun.current = true; onComplete() }
    if (state.clock.elapsedTime > nextReport.current) { onProgress(Math.max(0, position.current.y)); nextReport.current = state.clock.elapsedTime + .12 }
  })
  return <group ref={body} position={[0, .34, 0]} castShadow>
    <mesh castShadow position={[0, .55, 0]}><capsuleGeometry args={[.23, .65, 6, 12]} /><meshStandardMaterial color="#d8492a" roughness={.45} /></mesh>
    <mesh castShadow position={[0, 1.1, 0]}><sphereGeometry args={[.27, 20, 14]} /><meshStandardMaterial color="#f0a35b" roughness={.6} /></mesh>
    <mesh position={[0, 1.12, -.23]}><boxGeometry args={[.36, .13, .06]} /><meshStandardMaterial color="#20272a" metalness={.8} roughness={.2} /></mesh>
  </group>
}

function World({ running, mode, modifiers, biome, heat, ghostPath, runId, onProgress, onFall, collectedShards, collectedArtifacts, onCollect, onArtifact, onGate, onGhostFrame, onLand, onBurst, onCheckpoint, onViewChange, onComplete }: { running: boolean; mode: RunMode; modifiers: RunModifiers; biome: BiomeId; heat: number; ghostPath: GhostFrame[]; runId: number; onProgress: (height: number) => void; onFall: () => boolean; collectedShards: Set<number>; collectedArtifacts: Set<number>; onCollect: (index: number) => void; onArtifact: (index: number) => void; onGate: (index: number) => void; onGhostFrame: (frame: GhostFrame) => void; onLand: () => void; onBurst: () => void; onCheckpoint: (height: number) => void; onViewChange: (view: 'third' | 'first') => void; onComplete: () => void }) {
  const cables = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])
  const biomePalette = biome === 'neon-underpass' ? { sky: '#9b9bb6', fog: '#545775', ambient: '#d6d8f2', ground: '#313743' } : biome === 'cloud-cathedral' ? { sky: '#c9d8df', fog: '#a4b9c1', ambient: '#eff7ff', ground: '#61727a' } : biome === 'signal-core' ? { sky: '#e4c9b5', fog: '#b98172', ambient: '#ffe6c7', ground: '#3a2928' } : { sky: '#d5cdbd', fog: '#d5cdbd', ambient: '#fff3d7', ground: '#546451' }
  const contractTint = mode === 'stormline' ? { sky: '#879a9a', fog: '#667b7b', ambient: '#d5e0d8', ground: '#3d4948' } : mode === 'zenith' ? { sky: '#b9c9d7', fog: '#8fa8b7', ambient: '#e7f1ff', ground: '#465565' } : biomePalette
  const palette = biome === 'rust-yard' ? contractTint : biomePalette
  return <Canvas shadows camera={{ fov: 56, near: .1, far: 1200, position: [4, 7, 15] }} dpr={[1, 1.75]}>
    <color attach="background" args={[palette.sky]} />
    <fog attach="fog" args={[palette.fog, 34, 190]} />
    <ambientLight intensity={1.55} color={palette.ambient} />
    <directionalLight castShadow position={[8, 18, 10]} intensity={2.8} color="#ffe0a8" shadow-mapSize={[2048, 2048]} />
    <hemisphereLight args={['#f4c49a', '#36402f', 1.2]} />
    <Environment preset="sunset" />
    <WorldBackdrop mode={mode} />
    <Stars radius={75} depth={22} count={1000} factor={2} saturation={.15} fade speed={.2} />
    <Sparkles count={85 + Math.floor(heat / 10) * 8} scale={[28, 30, 25]} size={2.5 + heat / 70} speed={.22 + heat / 180} color={heat > 70 ? '#ff9a67' : '#fff0bf'} />
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -.25, -45]}><planeGeometry args={[360, 360]} /><meshStandardMaterial color={palette.ground} roughness={1} /></mesh>
    {platforms.map((p, i) => <PlatformMesh platform={p} key={i} />)}
    {signalShards.map((shard, i) => <SignalShardMesh shard={shard} collected={collectedShards.has(i)} key={`shard-${i}`} />)}
    {signalArtifacts.map((artifact, i) => <SignalArtifactMesh artifact={artifact} collected={collectedArtifacts.has(i)} key={`artifact-${i}`} />)}
    {cables.map((i) => <mesh key={i} position={[(i % 4 - 1.5) * 6.5, 10 + i * 2.1, -6 - i * 1.3]}><cylinderGeometry args={[.035, .035, 18, 6]} /><meshStandardMaterial color="#4a4034" roughness={.8} /></mesh>)}
    <Float speed={1.5} rotationIntensity={.1} floatIntensity={.35}><mesh position={[-5, 17, -11]}><icosahedronGeometry args={[.65, 1]} /><meshStandardMaterial color="#d6a845" metalness={.65} roughness={.25} /></mesh></Float>
    <EchoRunner path={ghostPath} active={running} runId={runId} />
    <Player running={running} mode={mode} modifiers={modifiers} onProgress={onProgress} onFall={onFall} onCollect={onCollect} onArtifact={onArtifact} onGate={onGate} onGhostFrame={onGhostFrame} onLand={onLand} onBurst={onBurst} onCheckpoint={onCheckpoint} onViewChange={onViewChange} onComplete={onComplete} />
    <Html position={[0, courseHeight + 1.2, -55]} center distanceFactor={12}><div className="peak-tag">THE SIGNAL</div></Html>
  </Canvas>
}

const drawCards = (seed: number) => CARD_POOL.map((_, index) => CARD_POOL[(seed + index * 2) % CARD_POOL.length])

function App() {
  const audio = useRef<AudioContext | null>(null)
  const recording = useRef<GhostFrame[]>([])
  const [running, setRunning] = useState(false)
  const [height, setHeight] = useState(0)
  const [falls, setFalls] = useState(0)
  const [collectedShards, setCollectedShards] = useState<Set<number>>(new Set())
  const [best, setBest] = useState(() => Number(localStorage.getItem('summit-signal-best') || 0))
  const [started, setStarted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [startedAt, setStartedAt] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [finalTime, setFinalTime] = useState(0)
  const [speedrunBest, setSpeedrunBest] = useState(() => Number(localStorage.getItem('summit-signal-speedrun-best') || 0))
  const [combo, setCombo] = useState(0)
  const [comboBest, setComboBest] = useState(() => Number(localStorage.getItem('summit-signal-combo-best') || 0))
  const [signalFlash, setSignalFlash] = useState('')
  const [burstReady, setBurstReady] = useState(true)
  const [checkpointHeight, setCheckpointHeight] = useState(0)
  const [mode, setMode] = useState<RunMode>('standard')
  const [modifiers, setModifiers] = useState<RunModifiers>(DEFAULT_MODIFIERS)
  const [activeCards, setActiveCards] = useState<SignalCard[]>([])
  const [pendingCards, setPendingCards] = useState<SignalCard[]>([])
  const [cardSeed, setCardSeed] = useState(0)
  const [gateHits, setGateHits] = useState<Set<number>>(new Set())
  const [artifactHits, setArtifactHits] = useState<Set<number>>(new Set())
  const [heat, setHeat] = useState(0)
  const [ghostPath, setGhostPath] = useState<GhostFrame[]>(() => {
    try { return JSON.parse(localStorage.getItem('summit-signal-echo') || '[]') as GhostFrame[] } catch { return [] }
  })
  const [runId, setRunId] = useState(0)
  const [cameraMode, setCameraMode] = useState<'third' | 'first'>('third')
  const progress = Math.min(100, Math.round(height / courseHeight * 100))
  const biome = getBiome(height, courseHeight)
  const modeLabel = getModeLabel(mode)
  const nextPlatform = platforms.find(platform => platform.y > height + .9) ?? platforms[platforms.length - 1]
  const radarX = THREE.MathUtils.clamp(50 + nextPlatform.x * 8, 10, 90)
  const onProgress = (next: number) => { setHeight(next); if (next > best) { setBest(next); localStorage.setItem('summit-signal-best', String(next)) } }
  useEffect(() => {
    if (!running || completed || !startedAt) return
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100)
    return () => window.clearInterval(timer)
  }, [running, completed, startedAt])
  useEffect(() => {
    if (!running) return
    const cool = window.setInterval(() => setHeat(current => Math.max(0, current - .7)), 200)
    return () => window.clearInterval(cool)
  }, [running])
  const startRun = () => { if (!audio.current) audio.current = new AudioContext(); void audio.current.resume(); recording.current = []; setRunId(current => current + 1); setCameraMode('third'); setStarted(true); setCompleted(false); setElapsed(0); setStartedAt(Date.now()); setHeight(0); setCheckpointHeight(0); setFalls(0); setCombo(0); setHeat(0); setBurstReady(true); setSignalFlash(''); setCollectedShards(new Set()); setGateHits(new Set()); setArtifactHits(new Set()); setModifiers(DEFAULT_MODIFIERS); setActiveCards([]); setPendingCards([]); setCardSeed(0); setRunning(true) }
  const pauseRun = () => { if (startedAt) setElapsed((Date.now() - startedAt) / 1000); setRunning(false) }
  const resumeRun = () => { setStartedAt(Date.now() - elapsed * 1000); setRunning(true) }
  const completeRun = () => {
    const time = startedAt ? (Date.now() - startedAt) / 1000 : elapsed
    setFinalTime(time)
    setCompleted(true)
    setRunning(false)
    if (recording.current.length > 1) { setGhostPath(recording.current); localStorage.setItem('summit-signal-echo', JSON.stringify(recording.current)) }
    playCue(audio.current, 'finish')
    if (!speedrunBest || time < speedrunBest) { setSpeedrunBest(time); localStorage.setItem('summit-signal-speedrun-best', String(time)) }
  }
  const chooseCard = (card: SignalCard) => { setActiveCards(current => [...current, card]); setModifiers(current => mergeModifiers(current, card)); setPendingCards([]); setRunning(true); setSignalFlash(`${card.title} ONLINE · KEEP CLIMBING`) }
  useEffect(() => {
    if (!pendingCards.length) return
    const chooseWithKey = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === '1') chooseCard(pendingCards[0]); else if (event.key === '2' && pendingCards[1]) chooseCard(pendingCards[1]); else if (event.key === '3' && pendingCards[2]) chooseCard(pendingCards[2]) }
    addEventListener('keydown', chooseWithKey)
    return () => removeEventListener('keydown', chooseWithKey)
  }, [pendingCards])
  const handleFall = () => {
    if (modifiers.anchorCharges > 0) { setModifiers(current => ({ ...current, anchorCharges: current.anchorCharges - 1 })); setHeat(0); setSignalFlash('ANCHOR SPENT · FALL FORGIVEN'); playCue(audio.current, 'checkpoint'); return true }
    setFalls(v => v + 1); setCombo(0); setHeat(0); setSignalFlash('RUN BROKEN · RETURNING TO CHECKPOINT'); playCue(audio.current, 'fail'); return false
  }
  const handleCheckpoint = (next: number) => { setCheckpointHeight(next); setHeat(current => Math.min(100, current + 10)); setSignalFlash(`CHECKPOINT LOCKED · ${Math.floor(next * 10)}M`); setCardSeed(seed => seed + 1); setPendingCards(drawCards(cardSeed)); setRunning(false); playCue(audio.current, 'checkpoint') }
  const handleGate = (index: number) => { setGateHits(current => new Set(current).add(index)); setCombo(current => current + 3); setHeat(current => Math.min(100, current + 22)); setStartedAt(current => current + 1800); setSignalFlash(`SIGNAL GATE ${index + 1}/4 · +3 STREAK · -1.8S`); playCue(audio.current, 'gate') }
  const handleArtifact = (index: number) => { setArtifactHits(current => new Set(current).add(index)); setCombo(current => current + 2); setHeat(current => Math.min(100, current + 12)); setSignalFlash(`ARTIFACT CACHE ${index + 1}/6 · +2 STREAK`); playCue(audio.current, 'shard') }
  return <main className={heat > 70 ? 'heat-hot' : ''}>
    <World running={running} mode={mode} modifiers={modifiers} biome={biome} heat={heat} ghostPath={ghostPath} runId={runId} onProgress={onProgress} onFall={handleFall} collectedShards={collectedShards} collectedArtifacts={artifactHits} onCollect={(index) => { setCollectedShards(current => new Set(current).add(index)); setHeat(current => Math.min(100, current + 8)); setSignalFlash(`SIGNAL ${index + 1}/5 CAPTURED`); playCue(audio.current, 'shard') }} onArtifact={handleArtifact} onGate={handleGate} onGhostFrame={(frame) => { if (recording.current.length < 6000) recording.current.push(frame) }} onLand={() => { playCue(audio.current, 'land'); setHeat(current => Math.min(100, current + 5)); setCombo(current => { const next = current + 1; if (next > comboBest) { setComboBest(next); localStorage.setItem('summit-signal-combo-best', String(next)) }; return next }) }} onBurst={() => { setBurstReady(false); setHeat(current => Math.min(100, current + 4)); setSignalFlash('SIGNAL BURST · KEEP CLIMBING'); playCue(audio.current, 'burst'); window.setTimeout(() => setBurstReady(true), 2600 * modifiers.burstCooldownMultiplier) }} onCheckpoint={handleCheckpoint} onViewChange={setCameraMode} onComplete={completeRun} />
    <section className="brand"><p>ALTITUDE // 01</p><h1>SUMMIT<br /><i>SIGNAL</i></h1><span>an ascent with consequences</span></section>
    <section className="telemetry" aria-label="Game telemetry"><div><span>ALTITUDE</span><strong>{Math.floor(height * 10)}<small>m</small></strong></div><div><span>PERSONAL BEST</span><strong>{Math.floor(best * 10)}<small>m</small></strong></div><div><span>RETRIES</span><strong>{falls.toString().padStart(2, '0')}</strong></div><div><span>SIGNALS</span><strong>{collectedShards.size}<small>/5</small></strong></div></section>
    <section className="speedrun" aria-label="Speedrun timing"><div><span>RUN TIME</span><strong>{formatTime(elapsed)}</strong></div><div><span>SPEEDRUN PB</span><strong>{speedrunBest ? formatTime(speedrunBest) : '--:--.-'}</strong></div></section>
    {running && <section className="run-stats" aria-label="Run streak"><span>LANDING STREAK</span><strong>{combo.toString().padStart(2, '0')}</strong><small>BEST {comboBest.toString().padStart(2, '0')}</small></section>}
    {running && <section className={`burst ${burstReady ? 'ready' : ''}`} aria-label="Signal burst"><span>SIGNAL BURST</span><strong>{burstReady ? 'READY' : 'CHARGING'}</strong><small>SHIFT · AIR RECOVERY</small></section>}
    {running && ghostPath.length > 1 && <div className="echo-badge">ECHO <strong>PB GHOST</strong><small>CHASE YOUR LINE</small></div>}
    {running && <div className={`contract-badge contract-${mode}`} aria-label={`Active contract ${modeLabel}`}>CONTRACT / <strong>{modeLabel}</strong></div>}
    {running && <div className="biome-tag">ZONE / <strong>{biomeLabels[biome]}</strong></div>}
    {running && <div className="gate-hunt">GATES <strong>{gateHits.size}/4</strong><small>RING THE SIGNAL</small></div>}
    {running && <div className="artifact-hunt">CACHE <strong>{artifactHits.size}/6</strong><small>FIND THE KEYS</small></div>}
    {running && <section className="heat-meter" aria-label="Momentum heat"><span>FLOW HEAT</span><strong>{Math.round(heat)}%</strong><div><i style={{ width: `${heat}%` }} /></div><small>{heat > 70 ? 'OVERDRIVE' : 'KEEP THE LINE'}</small></section>}
    {running && <section className="route-radar" aria-label="Next ledge radar"><span>NEXT LEDGE</span><strong>{Math.floor(nextPlatform.y * 10)}M · {nextPlatform.kind.toUpperCase()}</strong><div><i style={{ left: `${radarX}%` }} /></div><small>{nextPlatform.x > .5 ? 'STEER RIGHT' : nextPlatform.x < -.5 ? 'STEER LEFT' : 'CENTER LINE'}</small></section>}
    {running && activeCards.length > 0 && <div className="active-cards" aria-label="Active signal cards">{activeCards.map(card => <span key={card.id} style={{ borderColor: card.accent }} title={`${card.title}: ${card.upside}`}><b>{card.title.slice(0, 1)}</b></span>)}</div>}
    {running && <div className="checkpoint">ANCHOR <strong>{Math.floor(checkpointHeight * 10)}M</strong></div>}
    <section className="route"><span>ROUTE 01 / CLOUDLINE · 1KM</span><div><i style={{ width: `${progress}%` }} /></div><b>{progress}%</b></section>
    {!started && !completed && <section className="start-panel"><div className="eyebrow">SURVIVAL CLIMBING PROTOTYPE · SIGNAL HUNT</div><h2>EVERY LEDGE<br />IS A DECISION.</h2><p>Climb a discarded world suspended above the weather. Beat the clock, collect all five shards, and reach the summit.</p><div className="contracts" role="group" aria-label="Run contract"><button className={mode === 'standard' ? 'selected' : ''} onClick={() => setMode('standard')}><b>STANDARD</b><small>BASELINE LINE</small></button><button className={mode === 'stormline' ? 'selected' : ''} onClick={() => setMode('stormline')}><b>STORMLINE</b><small>HEAVIER WIND</small></button><button className={mode === 'zenith' ? 'selected' : ''} onClick={() => setMode('zenith')}><b>ZENITH</b><small>LIGHTER GRAVITY</small></button></div><button onClick={startRun}>BEGIN ASCENT <span>↗</span></button><small>A / D STEER · W / S ADVANCE · SHIFT BURST · MOUSE LOOK</small></section>}
    {running && <button className="pause" onClick={pauseRun}>PAUSE</button>}
    {started && !running && !completed && <button className="resume" onClick={resumeRun}>RESUME RUN ↗</button>}
    {completed && <section className="finish-panel"><div className="eyebrow">SUMMIT REACHED · {modeLabel} · SIGNAL HUNT {collectedShards.size}/5</div><h2>YOU MADE<br /><i>THE SIGNAL.</i></h2><p>Final time <strong>{formatTime(finalTime)}</strong>{speedrunBest === finalTime ? ' · new personal best' : ''}<br /><small>GATES {gateHits.size}/4 · CACHE {artifactHits.size}/6</small></p><button onClick={startRun}>RUN IT BACK <span>↗</span></button></section>}
    {running && <div className="reticle" aria-hidden="true"><i /><b /></div>}
    {pendingCards.length > 0 && <section className="card-dialog" role="dialog" aria-modal="true" aria-label="Choose a signal card"><div className="eyebrow">CHECKPOINT LOCKED · CHOOSE YOUR EDGE</div><h2>BUILD<br /><i>THE RUN.</i></h2><p>Pick one signal. The climb resumes the moment you commit.</p><div className="card-options">{pendingCards.map((card, index) => <button className="route-card" key={card.id} onClick={() => chooseCard(card)} style={{ '--card-accent': card.accent } as React.CSSProperties}><span className="card-index">0{index + 1}</span><strong>{card.title}</strong><b>{card.upside}</b><small>COST · {card.cost}</small><em>{index + 1}</em></button>)}</div><small className="card-hint">1 / 2 / 3 SELECT · ESC ACCEPTS FIRST</small></section>}
    {running && signalFlash && <div className="signal-flash" role="status">{signalFlash}</div>}
    {running && <div className="camera-hint">C / RECENTER · V / {cameraMode === 'third' ? 'FIRST PERSON' : 'CHASE CAM'}</div>}
    <footer><span>BUILD 01.07</span><span>ORIGINAL PROCEDURAL ENVIRONMENT</span><span>© 2026 SUMMIT SIGNAL</span></footer>
  </main>
}

export default App

createRoot(document.getElementById('root')!).render(<App />)
