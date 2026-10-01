// Gera as capturas de tela da landing page a partir de um banco de demonstração fictício.
//
//   npm run capture:landing
//
// 1. Lê o .env.local, deriva o banco "agendi_demo" do MONGODB_URI, apaga só ele e o semeia.
// 2. Sobe `next dev` numa porta livre apontando para o banco demo.
// 3. Entra com o usuário demo pelo /login e captura Início, Calendário (semana),
//    Caixa › Resumo e Caixa › Planejamento com o Playwright (Chromium).
// 4. Converte para WebP em public/landing/ e sempre derruba o servidor no fim.

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import bcrypt from "bcryptjs"
import { MongoClient, ObjectId, type Db } from "mongodb"
import { chromium, type Page } from "playwright"
import sharp from "sharp"
import { EXPENSE_GROUP_ICONS } from "../src/lib/expense-group-icon"

const ROOT = path.resolve(__dirname, "..")
const DEMO_DB = "agendi_demo"
const OUT_DIR = path.join(ROOT, "public", "landing")
const TMP_DIR = path.join(os.tmpdir(), "agendi-landing-capture")
const VIEWPORT = { width: 1850, height: 990 }
const SCALE = 2
const MAX_WIDTH = 2400
const WEBP_QUALITY = 82
const DEMO_EMAIL = "demo@agendi.app"

// ---------------------------------------------------------------------------------------------
// Ambiente

function loadEnvFile(file: string) {
  const env: Record<string, string> = {}
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 0) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "")
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

// Troca (ou acrescenta) o nome do banco no URI, mantendo credenciais, hosts e query string.
function withDatabase(uri: string, db: string) {
  const match = /^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/([^?]*))?(\?.*)?$/.exec(uri)
  if (!match) throw new Error("MONGODB_URI em formato inesperado")
  return `${match[1]}/${db}${match[3] ?? ""}`
}

function assertDemoDb(db: Db) {
  if (db.databaseName !== DEMO_DB) {
    throw new Error(`Abortado: o banco alvo é "${db.databaseName}", não "${DEMO_DB}"`)
  }
}

// ---------------------------------------------------------------------------------------------
// Utilidades de data (horário de Brasília, UTC-3 fixo)

const BRT = 3
const DAY_MS = 24 * 60 * 60 * 1000
const MIN_MS = 60 * 1000

function brtToday(now: Date) {
  return new Date(now.getTime() - BRT * 60 * MIN_MS).toISOString().slice(0, 10)
}
function dayToUtc(day: string) {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function addDays(day: string, n: number) {
  return new Date(dayToUtc(day).getTime() + n * DAY_MS).toISOString().slice(0, 10)
}
function weekday(day: string) {
  return dayToUtc(day).getUTCDay() // 0 = domingo
}
function mondayOf(day: string) {
  return addDays(day, -((weekday(day) + 6) % 7))
}
// Horário de parede em Brasília -> instante UTC.
function brtAt(day: string, minutes: number) {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d, BRT) + minutes * MIN_MS)
}
function hm(value: string) {
  const [h, m] = value.split(":").map(Number)
  return h * 60 + m
}

// PRNG determinístico para o seed ficar estável entre execuções.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260928)
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

// ---------------------------------------------------------------------------------------------
// Dados fictícios

type Category = "hair" | "aesthetics" | "massage" | "brows"

const CLIENTS = [
  "Aline Moraes", "Beatriz Lacerda", "Carolina Paiva", "Daniela Freitas", "Eduarda Siqueira", "Fernanda Queiroz",
  "Gabriela Toledo", "Helena Barros", "Isabela Cunha", "Joana Prado", "Karina Vilela", "Luana Serrano",
  "Mariana Leal", "Natália Dantas", "Olívia Brandão", "Patrícia Amaral", "Rafaela Guedes", "Sabrina Teles",
  "Tainá Moura", "Vanessa Rangel", "Yasmin Correia", "Alice Fontes", "Bruna Esteves", "Cecília Arruda",
  "Débora Pires", "Elisa Mattos", "Flávia Rezende", "Giovana Assis", "Heloísa Nunes", "Ingrid Sampaio",
  "Júlia Cardoso", "Lívia Monteiro", "Manuela Faria", "Nicole Bastos", "Priscila Ventura", "Renata Soares",
  "Sofia Caldeira", "Thaís Aguiar", "Valéria Lins", "Lorena Viana", "Marcos Tavares", "Rodrigo Peixoto",
  "André Figueira", "Lucas Brito", "Pedro Albuquerque", "Camila Rosário", "Letícia Duarte", "Amanda Coelho",
] as const

type ProductSeed = { key: string; name: string; costCents: number; quantity: number; rating: number | null }
const PRODUCTS: ProductSeed[] = [
  { key: "shampoo", name: "Shampoo profissional 1 L", costCents: 8900, quantity: 6, rating: 5 },
  { key: "mascara", name: "Máscara de hidratação 500 g", costCents: 7400, quantity: 4, rating: 4 },
  { key: "escova", name: "Protetor térmico spray", costCents: 5200, quantity: 5, rating: 4 },
  { key: "oleo", name: "Óleo de massagem neutro 1 L", costCents: 6800, quantity: 7, rating: 5 },
  { key: "drenagem", name: "Creme para drenagem 1 kg", costCents: 9600, quantity: 3, rating: 4 },
  { key: "argila", name: "Argila verde 500 g", costCents: 3900, quantity: 5, rating: 4 },
  { key: "serum", name: "Sérum vitamina C 30 ml", costCents: 11800, quantity: 4, rating: 5 },
  { key: "esfoliante", name: "Esfoliante facial 250 g", costCents: 4600, quantity: 6, rating: 3 },
  { key: "henna", name: "Henna para sobrancelhas", costCents: 3500, quantity: 8, rating: 5 },
  { key: "toalhas", name: "Toalhas descartáveis (100 un.)", costCents: 2900, quantity: 12, rating: null },
  { key: "luvas", name: "Luvas nitrílicas (100 un.)", costCents: 3200, quantity: 9, rating: null },
  { key: "pedras", name: "Kit de pedras quentes", costCents: 24900, quantity: 1, rating: 5 },
]

type ServiceSeed = { name: string; price: number; minutes: number; category: Category; products: string[] }
const SERVICES: Record<"centro" | "jardins", ServiceSeed[]> = {
  centro: [
    { name: "Corte feminino", price: 120, minutes: 60, category: "hair", products: ["shampoo"] },
    { name: "Escova", price: 70, minutes: 45, category: "hair", products: ["shampoo", "escova"] },
    { name: "Hidratação capilar", price: 110, minutes: 60, category: "hair", products: ["shampoo", "mascara"] },
    { name: "Limpeza de pele", price: 180, minutes: 90, category: "aesthetics", products: ["esfoliante", "argila", "luvas"] },
    { name: "Design de sobrancelhas", price: 60, minutes: 30, category: "brows", products: ["henna"] },
    { name: "Drenagem linfática", price: 160, minutes: 60, category: "massage", products: ["drenagem", "toalhas"] },
    { name: "Massagem relaxante", price: 150, minutes: 60, category: "massage", products: ["oleo", "toalhas"] },
  ],
  jardins: [
    { name: "Massagem relaxante", price: 170, minutes: 60, category: "massage", products: ["oleo", "toalhas"] },
    { name: "Massagem com pedras quentes", price: 210, minutes: 90, category: "massage", products: ["pedras", "oleo"] },
    { name: "Drenagem linfática", price: 180, minutes: 60, category: "massage", products: ["drenagem", "toalhas"] },
    { name: "Limpeza de pele", price: 190, minutes: 90, category: "aesthetics", products: ["esfoliante", "argila"] },
    { name: "Revitalização facial", price: 230, minutes: 60, category: "aesthetics", products: ["serum"] },
    { name: "Design de sobrancelhas", price: 65, minutes: 30, category: "brows", products: ["henna"] },
  ],
}

type Person = { key: string; name: string; email: string; skills: Category[]; units: ("centro" | "jardins")[] }
const OWNER: Person = {
  key: "owner",
  name: "Marina Alves",
  email: DEMO_EMAIL,
  skills: ["aesthetics", "brows"],
  units: ["centro"],
}
const THERAPISTS: Person[] = [
  { key: "juliana", name: "Juliana Mendes", email: "juliana.mendes@studioaurora.example", skills: ["hair"], units: ["centro"] },
  { key: "tatiane", name: "Tatiane Lopes", email: "tatiane.lopes@studioaurora.example", skills: ["hair", "brows"], units: ["centro"] },
  { key: "bianca", name: "Bianca Rocha", email: "bianca.rocha@studioaurora.example", skills: ["aesthetics", "brows"], units: ["centro", "jardins"] },
  { key: "larissa", name: "Larissa Campos", email: "larissa.campos@studioaurora.example", skills: ["massage"], units: ["centro", "jardins"] },
  { key: "renata", name: "Renata Farias", email: "renata.farias@studioaurora.example", skills: ["massage", "aesthetics"], units: ["jardins"] },
]
const RECEPTIONIST = { name: "Paula Nogueira", email: "paula.nogueira@studioaurora.example" }

type UnitSeed = {
  key: "centro" | "jardins"
  name: string
  hours: { opensAt: string; closesAt: string }
  rooms: { name: string; beds: number; categories: Category[] }[]
  revenueShare?: { period: "monthly"; tiers: { upToCents: number | null; percent: number }[] }
  // Movimento relativo (1 = agenda cheia) e dias abertos (0 = domingo).
  load: number
  closedDays: number[]
}
const UNITS: UnitSeed[] = [
  {
    key: "centro",
    name: "Studio Aurora Centro",
    hours: { opensAt: "09:00", closesAt: "20:00" },
    rooms: [
      { name: "Salão", beds: 3, categories: ["hair"] },
      { name: "Cabine estética", beds: 2, categories: ["aesthetics", "brows"] },
      { name: "Sala de massagem", beds: 2, categories: ["massage"] },
    ],
    load: 0.78,
    closedDays: [0],
  },
  {
    key: "jardins",
    name: "Studio Aurora Jardins",
    hours: { opensAt: "10:00", closesAt: "19:00" },
    rooms: [
      { name: "Sala Lótus", beds: 2, categories: ["massage"] },
      { name: "Sala Jasmim", beds: 1, categories: ["aesthetics", "brows", "massage"] },
    ],
    // Funciona dentro de um clube parceiro, que fica com parte do faturamento do mês.
    revenueShare: {
      period: "monthly",
      tiers: [
        { upToCents: 3_000_000, percent: 20 },
        { upToCents: null, percent: 15 },
      ],
    },
    load: 0.7,
    closedDays: [0, 1],
  },
]

// ---------------------------------------------------------------------------------------------
// Seed

type SeedResult = { workspaceId: string; unitIds: Record<string, string>; password: string; stats: Record<string, number> }

async function seed(db: Db, now: Date): Promise<SeedResult> {
  assertDemoDb(db)
  await db.dropDatabase()

  const today = brtToday(now)
  const year = Number(today.slice(0, 4))
  const yearStart = `${year}-01-01`
  const weekMonday = mondayOf(today)
  // Atendido até agora; de madrugada ou de manhã cedo, a agenda de hoje aparece como se
  // fosse meio da tarde, para as telas mostrarem um dia em andamento.
  const doneUntil = new Date(Math.max(now.getTime(), brtAt(today, 14 * 60 + 30).getTime()))
  const stamp = { createdAt: new Date(`${year}-01-02T12:00:00Z`), updatedAt: now }
  const password = randomBytes(12).toString("base64url")

  // Usuários: a dona (login demo), as profissionais e a recepcionista.
  const ownerId = new ObjectId()
  const people = new Map<string, { id: ObjectId; person: Person }>()
  people.set(OWNER.key, { id: ownerId, person: OWNER })
  for (const t of THERAPISTS) people.set(t.key, { id: new ObjectId(), person: t })
  const receptionistId = new ObjectId()
  await db.collection("users").insertMany([
    { _id: ownerId, name: OWNER.name, email: DEMO_EMAIL, emailVerified: now, passwordHash: await bcrypt.hash(password, 10) },
    ...THERAPISTS.map((t) => ({ _id: people.get(t.key)!.id, name: t.name, email: t.email, emailVerified: now })),
    { _id: receptionistId, name: RECEPTIONIST.name, email: RECEPTIONIST.email, emailVerified: now },
  ])

  const workspaceId = new ObjectId()
  await db.collection("workspaces").insertOne({
    _id: workspaceId,
    name: "Studio Aurora",
    userId: ownerId,
    subscription: {
      planId: "padrao",
      status: "active",
      paidAt: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS),
    },
    ...stamp,
  })

  // Catálogo de ícones dos grupos de despesas (o app também cria na primeira leitura).
  const iconDocs = EXPENSE_GROUP_ICONS.map((icon, order) => ({ _id: new ObjectId(), ...icon, order, ...stamp }))
  await db.collection("expense_group_icons").insertMany(iconDocs)
  const iconId = (key: string) => iconDocs.find((icon) => icon.key === key)!._id

  const stats: Record<string, number> = { appointments: 0, bookings: 0, expenses: 0, products: 0, services: 0 }
  const unitIds: Record<string, string> = {}
  const unitRevenueByMonth = new Map<string, Map<string, number>>()

  for (const unitSeed of UNITS) {
    const unitId = new ObjectId()
    unitIds[unitSeed.key] = unitId.toString()
    const rooms = unitSeed.rooms.map((room) => ({ _id: new ObjectId(), name: room.name, beds: room.beds, categories: room.categories }))
    await db.collection("units").insertOne({
      _id: unitId,
      name: unitSeed.name,
      ...(unitSeed.revenueShare ? { revenueShare: unitSeed.revenueShare } : {}),
      treatmentRooms: rooms.map(({ _id, name, beds }) => ({ _id, name, beds })),
      businessHours: unitSeed.hours,
      openingBalance: { amountCents: unitSeed.key === "centro" ? 1_850_000 : 640_000, date: yearStart },
      workspaceId,
      ...stamp,
    })

    // Produtos
    const productDocs = PRODUCTS.map((p) => ({
      _id: new ObjectId(),
      key: p.key,
      name: p.name,
      quantity: p.quantity,
      costCents: p.costCents,
      notes: null,
      rating: p.rating,
      avatarUrl: null,
      depletedAt: Array.from({ length: between(1, 5) }, () => brtAt(addDays(today, -between(5, 200)), 600)).sort(
        (a, b) => a.getTime() - b.getTime(),
      ),
      unitId,
      ...stamp,
    }))
    await db.collection("products").insertMany(productDocs.map((doc) => { const { key, ...rest } = doc; void key; return rest }))
    stats.products += productDocs.length
    const productByKey = new Map(productDocs.map((p) => [p.key, p]))

    // Serviços
    const serviceDocs = SERVICES[unitSeed.key].map((s) => ({
      _id: new ObjectId(),
      seed: s,
      doc: {
        name: s.name,
        priceCents: s.price * 100,
        durationMinutes: s.minutes,
        productIds: s.products.map((key) => productByKey.get(key)!._id),
        unitId,
        ...stamp,
      },
    }))
    await db.collection("services").insertMany(serviceDocs.map(({ _id, doc }) => ({ _id, ...doc })))
    stats.services += serviceDocs.length

    // Quem atende nesta unidade e que serviços faz.
    const staff = [...people.values()].filter(({ person }) => person.units.includes(unitSeed.key))
    const servicesOf = (person: Person) => serviceDocs.filter((s) => person.skills.includes(s.seed.category))

    const opens = hm(unitSeed.hours.opensAt)
    const closes = hm(unitSeed.hours.closesAt)
    const appointments: Record<string, unknown>[] = []
    const bookings: Record<string, unknown>[] = []
    const revenueByMonth = new Map<string, number>()
    unitRevenueByMonth.set(unitSeed.key, revenueByMonth)

    // De 1º de janeiro até o fim da semana seguinte à atual.
    // Agenda até o fim do ano, cada vez mais vazia, para o previsto dos próximos meses.
    const lastDay = `${year}-12-31`
    for (let day = yearStart; day <= lastDay; day = addDays(day, 1)) {
      if (unitSeed.closedDays.includes(weekday(day))) continue
      const month = Number(day.slice(5, 7))
      // Crescimento ao longo do ano e sábados mais cheios.
      const growth = 0.72 + 0.03 * month
      const saturday = weekday(day) === 6 ? 1.12 : 1
      const weeksAhead = Math.max(0, Math.floor((dayToUtc(day).getTime() - dayToUtc(weekMonday).getTime()) / (7 * DAY_MS)) - 1)
      const ahead = weeksAhead > 0 ? Math.max(0.35, 0.9 - 0.05 * weeksAhead) : 1
      // Da semana atual em diante a agenda é mais folgada, para o calendário ficar legível.
      const calendarEase = day >= weekMonday ? 0.4 : 1
      const load = Math.min(0.95, unitSeed.load * growth * saturday * ahead * calendarEase)
      const inCalendar = day >= weekMonday
      // Ocupação das salas por fatia de 15 min.
      const roomUse = new Map<string, number>()
      const roomFree = (roomId: string, start: number, end: number, beds: number) => {
        for (let t = start; t < end; t += 15) if ((roomUse.get(`${roomId}:${t}`) ?? 0) >= beds) return false
        return true
      }
      const occupyRoom = (roomId: string, start: number, end: number) => {
        for (let t = start; t < end; t += 15) roomUse.set(`${roomId}:${t}`, (roomUse.get(`${roomId}:${t}`) ?? 0) + 1)
      }

      for (const { id: therapistId, person } of staff) {
        // A dona atende menos e as profissionais de duas unidades se dividem entre elas.
        const personLoad = load * (person.key === "owner" ? 0.35 : person.units.length > 1 ? 0.55 : 1)
        const options = servicesOf(person)
        if (!options.length) continue
        let t = opens + (rand() < 0.5 ? 0 : 30)
        while (t < closes) {
          if (rand() > personLoad) {
            t += pick([30, 60, 60, 90])
            continue
          }
          const service = pick(options)
          // Às vezes o cliente emenda um segundo serviço (ex.: corte + escova).
          const extra = rand() < 0.18 ? pick(options.filter((s) => s !== service)) : undefined
          const items = extra ? [service, extra] : [service]
          const minutes = items.reduce((sum, s) => sum + s.seed.minutes, 0)
          const end = t + minutes
          if (end > closes) break
          const room = rooms.find((r) => r.categories.includes(service.seed.category) && roomFree(r._id.toString(), t, end, r.beds))
          if (!room) {
            t += 30
            continue
          }
          occupyRoom(room._id.toString(), t, end)
          const startsAt = brtAt(day, t)
          const endsAt = brtAt(day, end)
          const guest = { name: pick(CLIENTS), room: String(between(1, 48)).padStart(2, "0") }
          const selectedProducts = service.doc.productIds.slice(0, between(0, service.doc.productIds.length)).map((pid) => ({
            productId: pid,
            productName: productDocs.find((p) => p._id.equals(pid))!.name,
          }))
          const done = endsAt.getTime() <= doneUntil.getTime() || (startsAt.getTime() < doneUntil.getTime() && rand() < 0.5)
          const appointmentId = done ? new ObjectId() : null
          if (done) {
            appointments.push({
              _id: appointmentId,
              unitId,
              performedAt: startsAt,
              guest,
              items: items.map((s) => ({
                serviceId: s._id,
                serviceName: s.doc.name,
                priceCents: s.doc.priceCents,
                durationMinutes: s.doc.durationMinutes,
                therapistId,
                therapistName: person.name,
              })),
              products: selectedProducts,
              createdBy: ownerId,
              createdAt: endsAt,
              updatedAt: endsAt,
            })
            const key = day.slice(0, 7)
            revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + items.reduce((sum, s) => sum + s.doc.priceCents, 0))
          }
          if (inCalendar) {
            // O agendamento no calendário é de um serviço; com dois, cobre o tempo dos dois.
            bookings.push({
              unitId,
              therapistId,
              therapistName: person.name,
              guest,
              startsAt,
              endsAt,
              service: { serviceId: service._id, serviceName: service.doc.name },
              treatmentRoom: { roomId: room._id, roomName: room.name },
              products: selectedProducts,
              color: null,
              appointmentId,
              createdBy: ownerId,
              createdAt: new Date(startsAt.getTime() - between(1, 10) * DAY_MS),
              updatedAt: now,
            })
          }
          t = end + pick([0, 0, 15, 30])
          t = Math.ceil(t / 15) * 15
        }
      }
    }
    if (appointments.length) await db.collection("appointments").insertMany(appointments)
    if (bookings.length) await db.collection("bookings").insertMany(bookings)
    stats.appointments += appointments.length
    stats.bookings += bookings.length

    // Grupos de despesas com limite mensal e os lançamentos do ano.
    const groups =
      unitSeed.key === "centro"
        ? [
            { name: "Aluguel", icon: "house", limit: 650000 },
            { name: "Energia", icon: "zap", limit: 90000 },
            { name: "Água", icon: "droplet", limit: 28000 },
            { name: "Internet e telefone", icon: "wifi", limit: 25000 },
            { name: "Insumos", icon: "package", limit: 380000 },
            { name: "Marketing", icon: "megaphone", limit: 150000 },
            { name: "Contador", icon: "file-text", limit: 65000 },
            { name: "Impostos", icon: "receipt", limit: 420000 },
            { name: "Limpeza", icon: "sparkles", limit: 60000 },
            { name: "Manutenção", icon: "wrench", limit: null },
          ]
        : [
            { name: "Insumos", icon: "package", limit: 180000 },
            { name: "Marketing", icon: "megaphone", limit: 80000 },
            { name: "Impostos", icon: "receipt", limit: 200000 },
            { name: "Lavanderia", icon: "sparkles", limit: 45000 },
            { name: "Taxas bancárias", icon: "landmark", limit: 30000 },
          ]
    const groupDocs = groups.map((g) => ({
      _id: new ObjectId(),
      name: g.name,
      monthlyLimitCents: g.limit,
      iconId: iconId(g.icon),
      unitId,
      ...stamp,
    }))
    await db.collection("expense_groups").insertMany(groupDocs)
    const groupId = (name: string) => groupDocs.find((g) => g.name === name)!._id

    const expenses: Record<string, unknown>[] = []
    const series = new Map<string, ObjectId>()
    const expense = (
      group: string,
      description: string,
      amountCents: number,
      date: string,
      recurring?: { key: string; number: number; count: number },
    ) => {
      // Pago até hoje, com algumas contas do mês ainda em aberto; futuro fica pendente.
      const paid = date < today ? rand() > 0.04 || date < `${today.slice(0, 7)}-01` : date === today && rand() < 0.5
      let seriesDoc = null
      if (recurring) {
        if (!series.has(recurring.key)) series.set(recurring.key, new ObjectId())
        seriesDoc = { id: series.get(recurring.key), kind: "recurring", number: recurring.number, count: recurring.count }
      }
      expenses.push({
        unitId,
        groupId: groupId(group),
        description,
        amountCents: Math.max(100, Math.round(amountCents)),
        date,
        paidAt: paid ? brtAt(date, 14 * 60) : null,
        series: seriesDoc,
        productId: null,
        createdBy: ownerId,
        createdAt: brtAt(date, 13 * 60),
        updatedAt: now,
      })
    }
    const vary = (base: number, spread: number) => base * (1 + (rand() * 2 - 1) * spread)
    const currentMonth = Number(today.slice(5, 7))
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0")
      const d = (day: number) => `${year}-${mm}-${String(day).padStart(2, "0")}`
      const isFuture = m > currentMonth
      const prevRevenue = revenueByMonth.get(`${year}-${String(m - 1).padStart(2, "0")}`) ?? revenueByMonth.get(`${year}-${mm}`) ?? 0
      if (unitSeed.key === "centro") {
        expense("Aluguel", "Aluguel da loja", 620000, d(5), { key: "aluguel", number: m, count: 12 })
        expense("Internet e telefone", "Plano de internet fibra", 18990, d(10), { key: "internet", number: m, count: 12 })
        expense("Contador", "Honorários contábeis", 59000, d(7), { key: "contador", number: m, count: 12 })
        if (!isFuture) {
          // Verão pesa mais na conta de luz.
          expense("Energia", "Conta de energia", vary(m <= 3 || m >= 11 ? 98000 : 76000, 0.08), d(15))
          expense("Água", "Conta de água", vary(22000, 0.15), d(18))
          expense("Insumos", "Reposição de produtos capilares", vary(145000, 0.2), d(8))
          expense("Insumos", "Descartáveis e luvas", vary(52000, 0.2), d(14))
          expense("Insumos", "Cosméticos da estética", vary(118000, 0.25), d(22))
          // Fim do mês: no mês atual ainda fica em aberto (lançado maior que pago).
          expense("Insumos", "Pedido mensal de esmaltes e acessórios", vary(42000, 0.2), d(29))
          expense("Marketing", "Impulsionamento de posts", vary(30000, 0.2), d(30))
          expense("Marketing", "Anúncios nas redes sociais", vary(90000, 0.25), d(3))
          if (m % 2 === 0) expense("Marketing", "Sessão de fotos do portfólio", vary(45000, 0.2), d(20))
          expense("Impostos", "Simples Nacional", prevRevenue * 0.06, d(20))
          expense("Limpeza", "Produtos de limpeza", vary(26000, 0.2), d(12))
          expense("Limpeza", "Diarista (quinzenal)", 32000, d(25))
          if (m % 3 === 1) expense("Manutenção", pick(["Manutenção do ar-condicionado", "Troca de lâmpadas e tomadas", "Conserto de secador"]), vary(38000, 0.3), d(17))
        }
      } else {
        expense("Taxas bancárias", "Tarifa da maquininha", 14900, d(2), { key: "tarifa", number: m, count: 12 })
        if (!isFuture) {
          expense("Insumos", "Óleos e cremes de massagem", vary(88000, 0.2), d(9))
          expense("Insumos", "Cosméticos faciais", vary(64000, 0.25), d(21))
          expense("Marketing", "Anúncios nas redes sociais", vary(55000, 0.25), d(4))
          expense("Impostos", "Simples Nacional", prevRevenue * 0.06, d(20))
          expense("Lavanderia", "Lavagem de toalhas e lençóis", vary(38000, 0.25), d(27))
          expense("Taxas bancárias", "Taxas de antecipação", vary(9000, 0.4), d(16))
        }
      }
    }
    await db.collection("expenses").insertMany(expenses)
    stats.expenses += expenses.length
  }

  // Funções: quem atende e quem recebe os clientes; a dona é administradora (acesso total).
  const allPages = {
    workspace: ["home", "units", "calendar", "cash_flow", "team", "stock", "users"],
    unit: ["overview", "services", "calendar", "appointments", "stock", "team", "cash_flow"],
  }
  const therapistRoleId = new ObjectId()
  const receptionistRoleId = new ObjectId()
  await db.collection("roles").insertMany([
    {
      _id: therapistRoleId,
      workspaceId,
      name: "Terapeuta",
      permissions: ["appointments.manage", "attends"],
      pages: allPages,
      ...stamp,
    },
    {
      _id: receptionistRoleId,
      workspaceId,
      name: "Recepcionista",
      permissions: ["bookings.manage", "appointments.manage", "inbox.use"],
      pages: allPages,
      ...stamp,
    },
  ])

  // Equipe: profissionais com comissão, uma com salário fixo, e a recepcionista com salário.
  const memberStamp = { acceptedAt: new Date(`${year}-01-02T12:00:00Z`), ...stamp }
  await db.collection("workspace_members").insertMany([
    { workspaceId, email: DEMO_EMAIL, admin: true, roleId: null, userId: ownerId, units: [], ...memberStamp },
    ...THERAPISTS.map((t) => ({
      workspaceId,
      email: t.email,
      admin: false,
      roleId: therapistRoleId,
      userId: people.get(t.key)!.id,
      units: t.units.map((u) => ({
        unitId: new ObjectId(unitIds[u]),
        commissionPercent: t.key === "renata" ? 30 : 40,
        salaryCents: t.key === "renata" ? 180000 : null,
        bonuses: [],
        startDate: yearStart,
        payDay: 5,
      })),
      ...memberStamp,
    })),
    {
      workspaceId,
      email: RECEPTIONIST.email,
      admin: false,
      roleId: receptionistRoleId,
      userId: receptionistId,
      units: [
        {
          unitId: new ObjectId(unitIds.centro),
          commissionPercent: null,
          salaryCents: 240000,
          bonuses: [{ description: "Vale-transporte", amountCents: 22000 }],
          startDate: yearStart,
          payDay: 5,
        },
      ],
      ...memberStamp,
    },
  ])

  return { workspaceId: workspaceId.toString(), unitIds, password, stats }
}

// ---------------------------------------------------------------------------------------------
// Servidor de desenvolvimento

function freePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once("error", () => resolve(freePort(preferred + 1)))
    server.listen(preferred, "127.0.0.1", () => server.close(() => resolve(preferred)))
  })
}

function killTree(child: ChildProcess | null) {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
  } else {
    try {
      process.kill(-child.pid, "SIGKILL")
    } catch {
      child.kill("SIGKILL")
    }
  }
}

// Já pode haver outro `next dev` no projeto (ele trava a pasta .next). Este sobe com a
// configuração resolvida do projeto, mas com distDir e tsconfig próprios em node_modules/.cache,
// para não disputar a pasta nem reescrever o tsconfig.json do projeto.
const NEXT_CACHE_DIR = path.join("node_modules", ".cache", "agendi-landing-next")

async function isolatedNextConfig() {
  const dir = path.join(ROOT, NEXT_CACHE_DIR)
  mkdirSync(dir, { recursive: true })
  const tsconfig = path.join(dir, "tsconfig.json")
  // Cópia do tsconfig do projeto (o Turbopack resolve os paths a partir da raiz do projeto).
  writeFileSync(tsconfig, readFileSync(path.join(ROOT, "tsconfig.json")))
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: loadConfig } = require("next/dist/server/config")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PHASE_DEVELOPMENT_SERVER } = require("next/dist/shared/lib/constants")
  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, ROOT)
  return JSON.stringify({
    ...config,
    distDir: path.join(NEXT_CACHE_DIR, "dev"),
    typescript: { ...config.typescript, tsconfigPath: path.relative(ROOT, tsconfig) },
  })
}

async function waitForServer(origin: string, child: ChildProcess, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev saiu com código ${child.exitCode}`)
    try {
      const res = await fetch(`${origin}/login`, { redirect: "manual" })
      if (res.status < 500) return
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error("next dev não respondeu a tempo")
}

// ---------------------------------------------------------------------------------------------
// Capturas

const HIDE_CSS = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
  [data-navigation-pending] > .fixed.top-0 { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`

async function settle(page: Page, extra?: () => Promise<void>) {
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {})
  await page.addStyleTag({ content: HIDE_CSS })
  await page
    .waitForFunction(() => document.querySelectorAll('[data-slot="skeleton"]').length === 0, null, { timeout: 60_000 })
    .catch(() => console.warn("  aviso: ainda há skeletons na tela"))
  if (extra) await extra()
  // Deixa as animações de entrada dos gráficos terminarem.
  await page.mouse.move(0, VIEWPORT.height - 1)
  await page.waitForTimeout(1500)
  const errorText = await page.locator("text=/Application error|Unhandled Runtime Error|This page could not be found/i").count()
  if (errorText) throw new Error(`A página ${page.url()} mostrou um erro`)
}

async function waitForCharts(page: Page, min = 1) {
  await page.waitForFunction((n) => document.querySelectorAll(".recharts-surface").length >= n, min, { timeout: 60_000 })
}

async function toWebp(png: string, name: string) {
  const out = path.join(OUT_DIR, `${name}.webp`)
  const image = sharp(png)
  const meta = await image.metadata()
  const resized = meta.width && meta.width > MAX_WIDTH ? image.resize({ width: MAX_WIDTH }) : image
  const info = await resized.webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true }).toFile(out)
  return { file: path.relative(ROOT, out), width: info.width, height: info.height, kb: Math.round(info.size / 1024) }
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const envFile = path.join(ROOT, ".env.local")
  if (!existsSync(envFile)) throw new Error(".env.local não encontrado")
  const env = loadEnvFile(envFile)
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI ausente no .env.local")
  const demoUri = withDatabase(env.MONGODB_URI, DEMO_DB)

  const now = new Date()
  const client = new MongoClient(demoUri)
  let seeded: SeedResult
  try {
    await client.connect()
    const db = client.db()
    assertDemoDb(db)
    console.log(`Semeando o banco "${db.databaseName}"...`)
    seeded = await seed(db, now)
    console.log("  ", seeded.stats)
  } finally {
    await client.close()
  }

  const port = await freePort(3210)
  const origin = `http://localhost:${port}`
  let server: ChildProcess | null = null
  const cleanup = () => killTree(server)
  process.on("exit", cleanup)
  process.on("SIGINT", () => {
    cleanup()
    process.exit(130)
  })

  // O next dev reescreve o next-env.d.ts (ignorado pelo git) com o distDir dele; volta ao fim.
  const nextEnvFile = path.join(ROOT, "next-env.d.ts")
  const nextEnvBackup = existsSync(nextEnvFile) ? readFileSync(nextEnvFile) : null
  const log: string[] = []

  try {
    console.log(`Subindo next dev em ${origin}...`)
    const standaloneConfig = await isolatedNextConfig()
    server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(port)], {
      cwd: ROOT,
      env: {
        ...process.env,
        MONGODB_URI: demoUri,
        AUTH_URL: origin,
        NEXTAUTH_URL: origin,
        APP_URL: origin,
        AUTH_TRUST_HOST: "true",
        NEXT_TELEMETRY_DISABLED: "1",
        __NEXT_PRIVATE_STANDALONE_CONFIG: standaloneConfig,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })
    const collect = (chunk: Buffer) => {
      const text = chunk.toString()
      log.push(text)
      if (/error/i.test(text)) process.stdout.write(`  [next] ${text.trim().slice(0, 500)}\n`)
    }
    server.stdout?.on("data", collect)
    server.stderr?.on("data", collect)
    await waitForServer(origin, server)
    console.log("  servidor pronto")

    mkdirSync(OUT_DIR, { recursive: true })
    rmSync(TMP_DIR, { recursive: true, force: true })
    mkdirSync(TMP_DIR, { recursive: true })

    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
        colorScheme: "light",
        reducedMotion: "no-preference",
      })
      const page = await context.newPage()
      page.setDefaultTimeout(120_000)

      console.log("Entrando com o usuário demo...")
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" })
      await page.fill("#email", DEMO_EMAIL)
      await page.fill("#password", seeded.password)
      await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 120_000 }),
        page.click('button[name="intent"][value="credentials"]'),
      ])

      const base = `${origin}/workspace/${seeded.workspaceId}`
      const unit = `${base}/unit/${seeded.unitIds.centro}`
      const shots: { name: string; url: string; ready: () => Promise<void> }[] = [
        { name: "inicio", url: base, ready: () => waitForCharts(page, 2) },
        {
          name: "calendario",
          url: `${unit}/calendar`,
          ready: async () => {
            await page.waitForFunction(
              () => {
                const calendar = document.querySelector<HTMLElement>(".booking-calendar")
                return (
                  !!calendar &&
                  calendar.getAttribute("aria-busy") !== "true" &&
                  (calendar.innerText.match(/[0-9]{2}:[0-9]{2}/g)?.length ?? 0) > 10
                )
              },
              null,
              { timeout: 60_000 },
            )
          },
        },
        {
          name: "gastos",
          url: `${unit}/cash-flow`,
          ready: async () => {
            await waitForCharts(page, 3)
            // Rola até o card "Gastos por grupo" ficar no terço de cima da tela (a landing recorta em center 30%).
            await page.evaluate(() => {
              const card = [...document.querySelectorAll<HTMLElement>('[data-slot="card"]')].find((el) =>
                el.innerText.includes("Gastos por grupo"),
              )
              if (!card) throw new Error('card "Gastos por grupo" não encontrado')
              window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 160)
            })
          },
        },
        { name: "planejamento", url: `${unit}/cash-flow/groups`, ready: async () => {} },
      ]

      const results = []
      for (const shot of shots) {
        console.log(`Capturando ${shot.name} (${shot.url.replace(origin, "")})...`)
        // A primeira visita compila a rota no dev; as seguintes já saem prontas. Com o código em
        // edição, a compilação pode falhar de passagem, então tenta de novo algumas vezes.
        for (let attempt = 1; ; attempt++) {
          try {
            await page.goto(shot.url, { waitUntil: "domcontentloaded", timeout: 180_000 })
            await settle(page).catch(() => {})
            await page.goto(shot.url, { waitUntil: "domcontentloaded", timeout: 180_000 })
            await settle(page, shot.ready)
            break
          } catch (error) {
            await page.screenshot({ path: path.join(TMP_DIR, `${shot.name}-erro-${attempt}.png`) }).catch(() => {})
            if (attempt >= 3) throw error
            console.warn(`  tentativa ${attempt} falhou (${String(error).split(/\r?\n/)[0]}); tentando de novo...`)
            await page.waitForTimeout(5000)
          }
        }
        const png = path.join(TMP_DIR, `${shot.name}.png`)
        await page.screenshot({ path: png, animations: "disabled" })
        results.push(await toWebp(png, shot.name))

      }

      console.log("\nArquivos gerados:")
      for (const r of results) console.log(`  ${r.file}  ${r.width}×${r.height}  ${r.kb} KB`)
    } finally {
      await browser.close()
    }
  } catch (error) {
    const tail = log.join("").split(/\r?\n/).slice(-40).join("\n")
    console.error(`\nÚltimas linhas do next dev:\n${tail}`)
    throw error
  } finally {
    cleanup()
    server = null
    if (nextEnvBackup) writeFileSync(nextEnvFile, nextEnvBackup)
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
