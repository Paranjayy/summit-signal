import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Float, Html, Sparkles, Stars } from '@react-three/drei'
import * as THREE from 'three'
import './styles.css'

type Platform = { x: number; y: number; z: number; width: number; depth: number; kind: 'scaffold' | 'sign' | 'container' | 'cloud' }
type SignalShard = { x: number; y: number; z: number }

const platforms: Platform[] = [
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

const signalShards: SignalShard[] = [
  { x: -2.8, y: 3.75, z: -1.3 },
  { x: 1.4, y: 6.05, z: -3.1 },
  { x: 0.6, y: 11.2, z: -5.6 },
  { x: -0.9, y: 16.9, z: -8.1 },
  { x: 0, y: 22.6, z: -10.8 },
]

function PlatformMesh({ platform }: { platform: Platform }) {
  const color = platform.kind === 'container' ? '#b74727' : platform.kind === 'sign' ? '#d7ad47' : platform.kind === 'cloud' ? '#dfe6e3' : '#6b5f49'
  return <group position={[platform.x, platform.y, platform.z]}>
    <mesh castShadow receiveShadow position={[0, -0.2, 0]}>
      <boxGeometry args={[platform.width, 0.4, platform.depth]} />
      <meshStandardMaterial color={color} roughness={platform.kind === 'cloud' ? 0.95 : 0.64} metalness={platform.kind === 'scaffold' ? 0.7 : 0.08} />
    </mesh>
    {platform.kind === 'scaffold' && [-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} castShadow position={[sx * (platform.width / 2 - .18), -1.1, sz * (platform.depth / 2 - .18)]}><cylinderGeometry args={[.08, .08, 1.8, 8]} /><meshStandardMaterial color="#312c23" metalness={.85} roughness={.3} /></mesh>))}
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

function Player({ running, onProgress, onFall, onCollect }: { running: boolean; onProgress: (height: number) => void; onFall: () => void; onCollect: (index: number) => void }) {
  const body = useRef<THREE.Group>(null)
  const velocity = useRef(new THREE.Vector3(0, 0, 0))
  const position = useRef(new THREE.Vector3(0, .34, 0))
  const keys = useRef<Record<string, boolean>>({})
  const nextReport = useRef(0)
  const claimedShards = useRef(new Set<number>())
  const grounded = useRef(true)
  const yaw = useRef(.55)
  const pitch = useRef(.16)
  const dragging = useRef(false)
  const previousPointer = useRef({ x: 0, y: 0 })
  const reset = () => { position.current.set(0, .34, 0); velocity.current.set(0, 0, 0); grounded.current = true }

  useEffect(() => {
    const down = (event: KeyboardEvent) => { const key = event.key.toLowerCase(); const code = event.code.toLowerCase(); keys.current[key] = true; keys.current[code] = true; if (key === 'r') reset() }
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
  }, [])

  useEffect(() => {
    reset()
    keys.current = {}
  }, [running])

  useFrame((state, delta) => {
    if (!body.current || !running) return
    const dt = Math.min(delta, .04)
    const steer = (Number(Boolean(keys.current.d || keys.current.arrowright)) - Number(Boolean(keys.current.a || keys.current.arrowleft)))
    const pace = (Number(Boolean(keys.current.w || keys.current.arrowup || keys.current.keyw)) - Number(Boolean(keys.current.s || keys.current.arrowdown || keys.current.keys)))
    const wantsJump = Boolean(keys.current[' '] || keys.current.space || keys.current.spacebar)
    velocity.current.x = THREE.MathUtils.damp(velocity.current.x, steer * 5.1, 10, dt)
    velocity.current.z = pace === 0 ? 0 : THREE.MathUtils.damp(velocity.current.z, pace * 3.8, 9, dt)
    if (wantsJump && grounded.current) { velocity.current.y = 9.6; grounded.current = false }
    if (!grounded.current) velocity.current.y -= 13.8 * dt
    const previousY = position.current.y
    position.current.addScaledVector(velocity.current, dt)
    if (!grounded.current && velocity.current.y < 0) {
      for (const p of platforms) {
        const onTop = previousY >= p.y + .18 && position.current.y <= p.y + .34
        const withinX = Math.abs(position.current.x - p.x) < p.width / 2 - .2
        const withinZ = Math.abs(position.current.z - p.z) < p.depth / 2 - .2
        if (onTop && withinX && withinZ) { position.current.y = p.y + .34; velocity.current.y = 0; grounded.current = true; break }
      }
    }
    if (position.current.y < -5) { onFall(); reset() }
    body.current.position.copy(position.current)
    body.current.rotation.z = THREE.MathUtils.damp(body.current.rotation.z, -velocity.current.x * .05, 5, dt)
    // Keep the lens on the playable lane. The avatar can drift through the
    // level's depth, but the camera must never follow it into the void after a miss.
    const lookTarget = new THREE.Vector3(position.current.x * .32, Math.max(1.1, position.current.y + 1.15), position.current.z - 1.8)
    const cameraDistance = 12.5
    const cameraOffset = new THREE.Vector3(Math.sin(yaw.current) * cameraDistance, 4.3 + Math.sin(pitch.current) * 5.5, Math.cos(yaw.current) * cameraDistance)
    state.camera.position.lerp(lookTarget.clone().add(cameraOffset), .1)
    state.camera.lookAt(lookTarget)
    signalShards.forEach((shard, index) => {
      if (!claimedShards.current.has(index) && position.current.distanceTo(new THREE.Vector3(shard.x, shard.y, shard.z)) < .85) {
        claimedShards.current.add(index)
        onCollect(index)
      }
    })
    if (state.clock.elapsedTime > nextReport.current) { onProgress(Math.max(0, position.current.y)); nextReport.current = state.clock.elapsedTime + .12 }
  })
  return <group ref={body} position={[0, .34, 0]} castShadow>
    <mesh castShadow position={[0, .55, 0]}><capsuleGeometry args={[.23, .65, 6, 12]} /><meshStandardMaterial color="#d8492a" roughness={.45} /></mesh>
    <mesh castShadow position={[0, 1.1, 0]}><sphereGeometry args={[.27, 20, 14]} /><meshStandardMaterial color="#f0a35b" roughness={.6} /></mesh>
    <mesh position={[0, 1.12, .23]}><boxGeometry args={[.36, .13, .06]} /><meshStandardMaterial color="#20272a" metalness={.8} roughness={.2} /></mesh>
  </group>
}

function World({ running, onProgress, onFall, collectedShards, onCollect }: { running: boolean; onProgress: (height: number) => void; onFall: () => void; collectedShards: Set<number>; onCollect: (index: number) => void }) {
  const cables = useMemo(() => Array.from({ length: 15 }, (_, i) => i), [])
  return <Canvas shadows camera={{ fov: 45, position: [9, 7, 14] }} dpr={[1, 1.75]}>
    <color attach="background" args={['#d5cdbd']} />
    <fog attach="fog" args={['#d5cdbd', 18, 66]} />
    <ambientLight intensity={1.55} color="#fff3d7" />
    <directionalLight castShadow position={[8, 18, 10]} intensity={2.8} color="#ffe0a8" shadow-mapSize={[2048, 2048]} />
    <hemisphereLight args={['#f4c49a', '#36402f', 1.2]} />
    <Environment preset="sunset" />
    <Stars radius={75} depth={22} count={1000} factor={2} saturation={.15} fade speed={.2} />
    <Sparkles count={85} scale={[28, 30, 25]} size={2.5} speed={.22} color="#fff0bf" />
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -.25, -4]}><planeGeometry args={[110, 110]} /><meshStandardMaterial color="#546451" roughness={1} /></mesh>
    {platforms.map((p, i) => <PlatformMesh platform={p} key={i} />)}
    {signalShards.map((shard, i) => <SignalShardMesh shard={shard} collected={collectedShards.has(i)} key={`shard-${i}`} />)}
    {cables.map((i) => <mesh key={i} position={[(i % 3 - 1) * 7, 8 + i * 1.7, -6 - i * .7]} rotation={[.15, 0, (i % 2 ? .2 : -.2)]}><cylinderGeometry args={[.025, .025, 15, 6]} /><meshStandardMaterial color="#4a4034" roughness={.8} /></mesh>)}
    <Float speed={1.5} rotationIntensity={.1} floatIntensity={.35}><mesh position={[-5, 17, -11]}><icosahedronGeometry args={[.65, 1]} /><meshStandardMaterial color="#d6a845" metalness={.65} roughness={.25} /></mesh></Float>
    <Player running={running} onProgress={onProgress} onFall={onFall} onCollect={onCollect} />
    <Html position={[0, 25.5, -10.8]} center distanceFactor={12}><div className="peak-tag">THE SIGNAL</div></Html>
  </Canvas>
}

function App() {
  const [running, setRunning] = useState(false)
  const [height, setHeight] = useState(0)
  const [falls, setFalls] = useState(0)
  const [collectedShards, setCollectedShards] = useState<Set<number>>(new Set())
  const [best, setBest] = useState(() => Number(localStorage.getItem('summit-signal-best') || 0))
  const progress = Math.min(100, Math.round(height / 24.6 * 100))
  const onProgress = (next: number) => { setHeight(next); if (next > best) { setBest(next); localStorage.setItem('summit-signal-best', String(next)) } }
  return <main>
    <World running={running} onProgress={onProgress} onFall={() => setFalls(v => v + 1)} collectedShards={collectedShards} onCollect={(index) => setCollectedShards(current => new Set(current).add(index))} />
    <section className="brand"><p>ALTITUDE // 01</p><h1>SUMMIT<br /><i>SIGNAL</i></h1><span>an ascent with consequences</span></section>
    <section className="telemetry" aria-label="Game telemetry"><div><span>ALTITUDE</span><strong>{Math.floor(height * 10)}<small>m</small></strong></div><div><span>PERSONAL BEST</span><strong>{Math.floor(best * 10)}<small>m</small></strong></div><div><span>RETRIES</span><strong>{falls.toString().padStart(2, '0')}</strong></div><div><span>SIGNALS</span><strong>{collectedShards.size}<small>/5</small></strong></div></section>
    <section className="route"><span>ROUTE 01 / CLOUDLINE</span><div><i style={{ width: `${progress}%` }} /></div><b>{progress}%</b></section>
    {!running && <section className="start-panel"><div className="eyebrow">SURVIVAL CLIMBING PROTOTYPE</div><h2>EVERY LEDGE<br />IS A DECISION.</h2><p>Climb a discarded world suspended above the weather. Miss once, learn fast, go again. Collect the red signal shards to complete the route.</p><button onClick={() => setRunning(true)}>BEGIN ASCENT <span>↗</span></button><small>A / D STEER · W / S ADVANCE · SPACE JUMP · MOUSE LOOK</small></section>}
    {running && <button className="pause" onClick={() => setRunning(false)}>PAUSE</button>}
    {running && <div className="reticle" aria-hidden="true"><i /><b /></div>}
    <footer><span>BUILD 01.07</span><span>ORIGINAL PROCEDURAL ENVIRONMENT</span><span>© 2026 SUMMIT SIGNAL</span></footer>
  </main>
}

export default App

createRoot(document.getElementById('root')!).render(<App />)
