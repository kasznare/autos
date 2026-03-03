import type { ActiveMission } from '../../store/types'

const MISSION_TEMPLATES: Array<Omit<ActiveMission, 'id' | 'progress'>> = [
  { type: 'collect_stars', label: 'Collect Stars', target: 5, reward: 90 },
  { type: 'pass_gates', label: 'Drive Through Gates', target: 4, reward: 105 },
  { type: 'collect_parts', label: 'Find Spare Parts', target: 3, reward: 120 },
  { type: 'clean_drive', label: 'Clean Drive Time', target: 20, reward: 130 },
]

export const buildMission = (index: number): ActiveMission => {
  const template = MISSION_TEMPLATES[index % MISSION_TEMPLATES.length]
  return {
    id: index,
    type: template.type,
    label: template.label,
    target: template.target,
    reward: template.reward,
    progress: 0,
  }
}

