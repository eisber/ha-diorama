import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { MathUtils, Mesh } from 'three'
import type { ScanState } from './useLocalScan.ts'

export default function ScanReference({ scan }: { scan: ScanState }) {
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => {
    scan.scene?.traverse(object => {
      if (!(object instanceof Mesh)) return
      object.castShadow = false
      object.receiveShadow = false
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.transparent = true
        material.opacity = scan.scan?.transform.opacity ?? 0.35
        material.depthWrite = false
        material.needsUpdate = true
      }
    })
    invalidate()
  }, [scan.scene, scan.scan?.transform.opacity, scan.visible, invalidate])
  if (!scan.scene || !scan.scan || !scan.visible) return null
  const { x, y, z, yaw, scale } = scan.scan.transform
  return (
    <group
      name={`scan:${scan.scan.hash}`}
      position={[x, y, z]}
      rotation={[0, MathUtils.degToRad(yaw), 0]}
      scale={scale}
    >
      <primitive object={scan.scene} dispose={null} />
    </group>
  )
}
