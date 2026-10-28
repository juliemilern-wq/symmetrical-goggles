/**
 * ============================================================================
 * FOLHAGEM & CIA - API DE LOJA DE PLANTAS
 * Processo Seletivo CITI - Desafio de Back-end
 * ============================================================================
 */

import { Request, Response, Router } from "express";
import { PrismaClient, Luminosidade, Planta } from "@prisma/client";

const prisma = new PrismaClient();

/* ============================================================================
   1. REPOSITORY LAYER (src/repositories/PlantaRepository.ts)
   ============================================================================ */

export interface CreatePlantaDTO {
  nome: string;
  especie: string;
  preco: number;
  estoque: number;
  luminosidade: Luminosidade;
  petFriendly: boolean;
  regaACadaDias: number;
}

export interface UpdatePlantaDTO {
  nome?: string;
  especie?: string;
  preco?: number;
  estoque?: number;
  luminosidade?: Luminosidade;
  petFriendly?: boolean;
  regaACadaDias?: number;
}

export interface FilterPlantaDTO {
  luminosidade?: Luminosidade;
  petFriendly?: boolean;
  nome?: string;
  ordem?: "preco" | "nome";
}

export class PlantaRepository {
  async create(data: CreatePlantaDTO): Promise<Planta> {
    return await prisma.planta.create({
      data,
    });
  }

  async findAll(filters: FilterPlantaDTO): Promise<Planta[]> {
    const where: any = {};

    if (filters.luminosidade) {
      where.luminosidade = filters.luminosidade;
    }

    if (filters.petFriendly !== undefined) {
      where.petFriendly = filters.petFriendly;
    }

    if (filters.nome) {
      where.nome = {
        contains: filters.nome,
        mode: "insensitive",
      };
    }

    const orderBy: any = {};
    if (filters.ordem) {
      orderBy[filters.ordem] = "asc";
    } else {
      orderBy.id = "asc";
    }

    return await prisma.planta.findMany({
      where,
      orderBy,
    });
  }

  async findById(id: number): Promise<Planta | null> {
    return await prisma.planta.findUnique({
      where: { id },
    });
  }

  async findEsgotadas(): Promise<Planta[]> {
    return await prisma.planta.findMany({
      where: { estoque: 0 },
      orderBy: { id: "asc" },
    });
  }

  async update(id: number, data: UpdatePlantaDTO): Promise<Planta> {
    return await prisma.planta.update({
      where: { id },
      data,
    });
  }

  async delete(id: number): Promise<void> {
    await prisma.planta.delete({
      where: { id },
    });
  }

  async decrementarEstoque(id: number, quantidade: number): Promise<boolean> {
    const result = await prisma.planta.updateMany({
      where: {
        id,
        estoque: {
          gte: quantidade,
        },
      },
      data: {
        estoque: {
          decrement: quantidade,
        },
      },
    });

    return result.count > 0;
  }

  async getValoresTotais(): Promise<{ valorTotalEmCentavos: number; totalDeVasos: number }> {
    const plantas = await prisma.planta.findMany({
      select: {
        preco: true,
        estoque: true,
      },
    });

    const resultado = plantas.reduce(
      (acc, planta) => {
        acc.valorTotalEmCentavos += planta.preco * planta.estoque;
        acc.totalDeVasos += planta.estoque;
        return acc;
      },
      { valorTotalEmCentavos: 0, totalDeVasos: 0 }
    );

    return resultado;
  }
}

/* ============================================================================
   2. CONTROLLER LAYER (src/controllers/PlantaController.ts)
   ============================================================================ */

const plantaRepository = new PlantaRepository();

export class PlantaController {
  
  private static validarCamposPlanta(body: any, isUpdate = false): string | null {
    const { nome, especie, preco, estoque, luminosidade, petFriendly, regaACadaDias } = body;

    if (!isUpdate) {
      if (
        nome === undefined ||
        especie === undefined ||
        preco === undefined ||
        estoque === undefined ||
        luminosidade === undefined ||
        petFriendly === undefined ||
        regaACadaDias === undefined
      ) {
        return "Todos os campos (nome, especie, preco, estoque, luminosidade, petFriendly, regaACadaDias) são obrigatórios.";
      }
    }

    if (nome !== undefined && (typeof nome !== "string" || nome.trim() === "")) {
      return "O campo 'nome' deve ser um texto não vazio.";
    }

    if (especie !== undefined && (typeof especie !== "string" || especie.trim() === "")) {
      return "O campo 'especie' deve ser um texto não vazio.";
    }

    if (preco !== undefined && (!Number.isInteger(preco) || preco <= 0)) {
      return "O campo 'preco' deve ser um número inteiro maior que zero (em centavos).";
    }

    if (estoque !== undefined && (!Number.isInteger(estoque) || estoque < 0)) {
      return "O campo 'estoque' deve ser um número inteiro maior ou igual a zero.";
    }

    if (
      luminosidade !== undefined &&
      !Object.values(Luminosidade).includes(luminosidade)
    ) {
      return "O campo 'luminosidade' deve ser 'SOMBRA', 'MEIA_SOMBRA' ou 'SOL_PLENO'.";
    }

    if (petFriendly !== undefined && typeof petFriendly !== "boolean") {
      return "O campo 'petFriendly' deve ser um valor booleano (true ou false).";
    }

    if (regaACadaDias !== undefined && (!Number.isInteger(regaACadaDias) || regaACadaDias < 1)) {
      return "O campo 'regaACadaDias' deve ser um número inteiro maior ou igual a 1.";
    }

    return null;
  }

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const erroValidacao = PlantaController.validarCamposPlanta(req.body, false);
      if (erroValidacao) {
        return res.status(400).json({ mensagem: erroValidacao });
      }

      const { nome, especie, preco, estoque, luminosidade, petFriendly, regaACadaDias } = req.body;

      const novaPlanta = await plantaRepository.create({
        nome: nome.trim(),
        especie: especie.trim(),
        preco,
        estoque,
        luminosidade,
        petFriendly,
        regaACadaDias,
      });

      return res.status(201).json(novaPlanta);
    } catch (error) {
      return res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
  }

  async findAll(req: Request, res: Response): Promise<Response> {
    try {
      const { luminosidade, petFriendly, nome, ordem } = req.query;

      const filters: FilterPlantaDTO = {};

      if (luminosidade !== undefined) {
        if (!Object.values(Luminosidade).includes(luminosidade as Luminosidade)) {
          return res.status(400).json({ mensagem: "Filtro 'luminosidade' inválido." });
        }
        filters.luminosidade = luminosidade as Luminosidade;
      }

      if (petFriendly !== undefined) {
        if (petFriendly !== "true" && petFriendly !== "false") {
          return res.status(400).json({ mensagem: "Filtro 'petFriendly' deve ser 'true' ou 'false'." });
        }
        filters.petFriendly = petFriendly === "true";
      }

      if (nome !== undefined) {
        if (typeof nome !== "string" || nome.trim() === "") {
          return res.status(400).json({ mensagem: "Filtro 'nome' inválido." });
        }
        filters.nome = nome.trim();
      }

      if (ordem !== undefined) {
        if (ordem !== "preco" && ordem !== "nome") {
          return res.status(400).json({ mensagem: "Filtro 'ordem' deve ser 'preco' ou 'nome'." });
        }
        filters.ordem = ordem as "preco" | "nome";
      }

      const plantas = await plantaRepository.findAll(filters);
      return res.status(200).json(plantas);
    } catch (error) {
      return res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
  }

  async findById(req: Request, res: Response): Promise<Response> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensagem: "O ID informado é inválido." });
      }

      const planta = await plantaRepository.findById(id);
      if (!planta) {
        return res.status(404).json({ mensagem: "Planta não encontrada." });
      }

      return res.status(200).json(planta);
    } catch (error) {
      return res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
  }

  async findEsgotadas(req: Request, res: Response): Promise<Response> {
    try {
      const plantasEsgotadas = await plantaRepository.findEsgotadas();
      return res.status(200).json(plantasEsgotadas);
    } catch (error) {
      return res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
  }

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensagem: "O ID informado é inválido." });
      }

      const plantaExistente = await plantaRepository.findById(id);
      if (!plantaExistente) {
        return res.status(404).json({ mensagem: "Planta não encontrada." });
      }

      const erroValidacao = PlantaController.validarCamposPlanta(req.body, true);
      if (erroValidacao) {
        return res.status(400).json({ mensagem: erroValidacao });
      }

      const dadosAtualizados = await plantaRepository.update(id, req.body);
      return res.status(200).json(dadosAtualizados);
    } catch (error) {
      return res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
  }

  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensagem: "O ID informado é inválido." });
      }

      const plantaExistente = await plantaRepository.findById(id);
      if (!plantaExistente) {
        return res.status(404).json({ mensagem: "Planta não encontrada." });
      }

      await plantaRepository.delete(id);
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
  }

  async realizarVenda(req: Request, res: Response): Promise<Response> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensagem: "O ID informado é inválido." });
      }

      const { quantidade } = req.body;
      if (!Number.isInteger(quantidade) || quantidade <= 0) {
        return res.status(400).json({ mensagem: "A quantidade para venda deve ser um inteiro maior que zero." });
      }

      const plantaExistente = await plantaRepository.findById(id);
      if (!plantaExistente) {
        return res.status(404).json({ mensagem: "Planta não encontrada." });
      }

      if (plantaExistente.estoque < quantidade) {
        return res.status(400).json({
          mensagem: `Estoque insuficiente. Restam apenas ${plantaExistente.estoque} vasos disponíveis.`,
        });
      }

      const sucesso = await plantaRepository.decrementarEstoque(id, quantidade);
      if (!sucesso) {
        return res.status(400).json({
          mensagem: "Não foi possível concluir a venda devido a alterações simultâneas no estoque.",
        });
      }

      const plantaAtualizada = await plantaRepository.findById(id);
      return res.status(200).json(plantaAtualizada);
    } catch (error) {
      return res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
  }

  async calcularValorTotalEstoque(req: Request, res: Response): Promise<Response> {
    try {
      const totais = await plantaRepository.getValoresTotais();
      return res.status(200).json(totais);
    } catch (error) {
      return res.status(500).json({ mensagem: "Erro interno no servidor." });
    }
  }
}

/* ============================================================================
   3. ROUTES LAYER (src/routes.ts)
   ============================================================================ */

const routes = Router();
const plantaController = new PlantaController();

routes.get("/plantas/esgotadas", (req, res) => plantaController.findEsgotadas(req, res));
routes.get("/plantas/estoque/valor-total", (req, res) => plantaController.calcularValorTotalEstoque(req, res));

routes.post("/plantas", (req, res) => plantaController.create(req, res));
routes.get("/plantas", (req, res) => plantaController.findAll(req, res));
routes.get("/plantas/:id", (req, res) => plantaController.findById(req, res));
routes.patch("/plantas/:id", (req, res) => plantaController.update(req, res));
routes.delete("/plantas/:id", (req, res) => plantaController.delete(req, res));
routes.post("/plantas/:id/venda", (req, res) => plantaController.realizarVenda(req, res));

export { routes };