export const seedOfficers = [
  { id: 'o1', name: 'Ama Mensah', role: 'Check-in Officer' },
  { id: 'o2', name: 'Kofi Owusu', role: 'Handover Officer' },
  { id: 'o3', name: 'Efua Addo', role: 'Logistics Manager' },
]

export const seedParticipants = [
  { id: 'p1', name: 'Abena Boateng', idNumber: 'ID-1001', phone: '0241001001', group: 'Bus A' },
  { id: 'p2', name: 'Kwame Asante', idNumber: 'ID-1002', phone: '0241001002', group: 'Bus A' },
  { id: 'p3', name: 'Yaa Darko', idNumber: 'ID-1003', phone: '0241001003', group: 'Bus B' },
  { id: 'p4', name: 'Kojo Anane', idNumber: 'ID-1004', phone: '0241001004', group: 'Bus B' },
  { id: 'p5', name: 'Akosua Frimpong', idNumber: 'ID-1005', phone: '0241001005', group: 'Bus C' },
  { id: 'p6', name: 'Nana Yaw Sarpong', idNumber: 'ID-1006', phone: '0241001006', group: 'Bus C' },
  { id: 'p7', name: 'Esi Quarshie', idNumber: 'ID-1007', phone: '0241001007', group: 'Bus A' },
  { id: 'p8', name: 'Yaw Mensah', idNumber: 'ID-1008', phone: '0241001008', group: 'Bus B' },
]

const t = (h, m) => `09:${String(m).padStart(2, '0')}:00`

export const seedBags = [
  {
    tagCode: 'LLM-0001',
    participantId: 'p1',
    status: 'HANDED_OVER',
    vehicle: 'TRUCK-01',
    timeline: [
      { event: 'CHECKED_IN', officer: 'Ama Mensah', time: t(9, 2), note: 'Bag tagged & receipt issued' },
      { event: 'LOADED', officer: 'Kofi Owusu', time: t(9, 15), note: 'Loaded onto TRUCK-01' },
      { event: 'IN_TRANSIT', officer: 'Kofi Owusu', time: t(9, 30), note: 'Manifest locked — truck departed' },
      { event: 'UNLOADED', officer: 'Kofi Owusu', time: t(10, 5), note: 'Scanned off truck at destination' },
      { event: 'HANDED_OVER', officer: 'Efua Addo', time: t(10, 20), note: 'ID verified — bag returned' },
    ],
  },
  {
    tagCode: 'LLM-0002',
    participantId: 'p1',
    status: 'HANDED_OVER',
    vehicle: 'TRUCK-01',
    timeline: [
      { event: 'CHECKED_IN', officer: 'Ama Mensah', time: t(9, 2), note: 'Bag tagged & receipt issued' },
      { event: 'LOADED', officer: 'Kofi Owusu', time: t(9, 16), note: 'Loaded onto TRUCK-01' },
      { event: 'IN_TRANSIT', officer: 'Kofi Owusu', time: t(9, 30), note: 'Manifest locked — truck departed' },
      { event: 'UNLOADED', officer: 'Kofi Owusu', time: t(10, 6), note: 'Scanned off truck at destination' },
      { event: 'HANDED_OVER', officer: 'Efua Addo', time: t(10, 22), note: 'ID verified — bag returned' },
    ],
  },
  {
    tagCode: 'LLM-0003',
    participantId: 'p2',
    status: 'HANDED_OVER',
    vehicle: 'TRUCK-01',
    timeline: [
      { event: 'CHECKED_IN', officer: 'Ama Mensah', time: t(9, 5), note: 'Bag tagged & receipt issued' },
      { event: 'LOADED', officer: 'Kofi Owusu', time: t(9, 18), note: 'Loaded onto TRUCK-01' },
      { event: 'IN_TRANSIT', officer: 'Kofi Owusu', time: t(9, 30), note: 'Manifest locked — truck departed' },
      { event: 'UNLOADED', officer: 'Kofi Owusu', time: t(10, 8), note: 'Scanned off truck at destination' },
      { event: 'HANDED_OVER', officer: 'Efua Addo', time: t(10, 25), note: 'ID verified — bag returned' },
    ],
  },
  {
    tagCode: 'LLM-0004',
    participantId: 'p3',
    status: 'UNLOADED',
    vehicle: 'TRUCK-01',
    timeline: [
      { event: 'CHECKED_IN', officer: 'Ama Mensah', time: t(9, 8), note: 'Bag tagged & receipt issued' },
      { event: 'LOADED', officer: 'Kofi Owusu', time: t(9, 20), note: 'Loaded onto TRUCK-01' },
      { event: 'IN_TRANSIT', officer: 'Kofi Owusu', time: t(9, 30), note: 'Manifest locked — truck departed' },
      { event: 'UNLOADED', officer: 'Kofi Owusu', time: t(10, 10), note: 'Scanned off truck at destination' },
    ],
  },
  {
    tagCode: 'LLM-0005',
    participantId: 'p3',
    status: 'UNLOADED',
    vehicle: 'TRUCK-01',
    timeline: [
      { event: 'CHECKED_IN', officer: 'Ama Mensah', time: t(9, 8), note: 'Bag tagged & receipt issued' },
      { event: 'LOADED', officer: 'Kofi Owusu', time: t(9, 21), note: 'Loaded onto TRUCK-01' },
      { event: 'IN_TRANSIT', officer: 'Kofi Owusu', time: t(9, 30), note: 'Manifest locked — truck departed' },
      { event: 'UNLOADED', officer: 'Kofi Owusu', time: t(10, 11), note: 'Scanned off truck at destination' },
    ],
  },
  {
    tagCode: 'LLM-0006',
    participantId: 'p4',
    status: 'UNLOADED',
    vehicle: 'TRUCK-01',
    timeline: [
      { event: 'CHECKED_IN', officer: 'Ama Mensah', time: t(9, 12), note: 'Bag tagged & receipt issued' },
      { event: 'LOADED', officer: 'Kofi Owusu', time: t(9, 24), note: 'Loaded onto TRUCK-01' },
      { event: 'IN_TRANSIT', officer: 'Kofi Owusu', time: t(9, 30), note: 'Manifest locked — truck departed' },
      { event: 'UNLOADED', officer: 'Kofi Owusu', time: t(10, 13), note: 'Scanned off truck at destination' },
    ],
  },
  {
    tagCode: 'LLM-0007',
    participantId: 'p5',
    status: 'CHECKED_IN',
    vehicle: null,
    timeline: [{ event: 'CHECKED_IN', officer: 'Ama Mensah', time: t(9, 25), note: 'Bag tagged & receipt issued' }],
  },
  {
    tagCode: 'LLM-0008',
    participantId: 'p6',
    status: 'CHECKED_IN',
    vehicle: null,
    timeline: [{ event: 'CHECKED_IN', officer: 'Ama Mensah', time: t(9, 28), note: 'Bag tagged & receipt issued' }],
  },
]
