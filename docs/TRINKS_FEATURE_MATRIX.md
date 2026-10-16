# Trinks × AgendaAI — inventário e plano de evolução

Revisão: 16/10/2026. Escopo: funcionalidades anunciadas publicamente em negocios.trinks.com, páginas de soluções, segmentos e planos. Não houve acesso ao produto pago da Trinks. Este inventário não afirma conhecer todos os recursos internos nem reproduz sua interface ou materiais proprietários.

No AgendaAI, “existente” significa que encontramos implementação no código; não significa que todos os provedores externos estejam homologados. “Parcial” indica limites concretos. A plataforma de administração do SaaS não equivale à gestão de franquias de um estabelecimento.

## Agenda e operação

Fonte: [essencial](https://negocios.trinks.com/solucoes/o-essencial-para-o-seu-sucesso/), [barbearias](https://negocios.trinks.com/negocios/barbearias/), [studios](https://negocios.trinks.com/negocios/studios/).

| Recurso público | AgendaAI | Evidência / trabalho necessário |
|---|---|---|
| Agenda online de serviços | Existente | `admin-agenda`, `agendar`, disponibilidade por profissional |
| Cliente escolher horário sozinho | Existente | `/agendar/:slug`, sem conta de cliente obrigatória |
| Confirmação de presença por link | Existente | `api/respond-appointment.ts`, tokens de confirmação |
| Solicitação de reserva sujeita a aprovação | Parcial | Há status pendente; falta preferência explícita do estabelecimento no fluxo público |
| Agendamentos recorrentes | Existente com limite | Séries internas de até 12 visitas; não é assinatura nem recorrência pública ilimitada |
| Fila de clientes sem hora marcada | Ausente — prioridade 1 | Persistência, ordenação, chamada e conversão atômica em atendimento |
| Rodízio de profissionais | Ausente — prioridade 1 | Entrada/saída, regras de distribuição, chamada concorrente sem duplicidade |
| Cadastro de clientes e histórico | Existente | `cliente.service`, detalhes do atendimento e histórico de visitas |
| Cadastro de profissionais e serviços | Existente | Equipe, duração/preços e vínculo profissional–serviço |
| Autonomia do profissional | Existente na web | Portal profissional, agenda e comissões com permissões |
| Aplicativo nativo para profissionais | Ausente | Acesso web responsivo não equivale a app nativo de loja |
| Fechamento de conta com serviços e produtos | Existente | Caixa atômico e comanda digital |
| Pacotes de serviços e controle de sessões | Ausente — prioridade 1 | Venda antecipada, saldo por cliente, validade, consumo e estorno sem dupla baixa |
| Fichas de anamnese personalizadas | Ausente — prioridade 2 | Formulários versionados, autorização para dados sensíveis e histórico auditável |
| Sinal de reserva | Ausente — prioridade 1 | Cobrança antes da reserva, expiração, confirmação via webhook e abatimento no fechamento |
| Autoatendimento com check-in | Parcial | Agendamento e pagamento por link; falta check-in e modo terminal |
| Site público do estabelecimento | Parcial | Página pública de reservas; falta portfólio/galeria e conteúdo de site independente |

## Financeiro, pagamentos e estoque

Fonte: [finanças](https://negocios.trinks.com/solucoes/simplificar-financas/), [clínicas](https://negocios.trinks.com/negocios/clinicas-de-estetica/).

| Recurso público | AgendaAI | Evidência / trabalho necessário |
|---|---|---|
| Abertura, entradas, saídas e fechamento de caixa | Existente | RPCs atômicas e relatório de fechamento |
| Contas a pagar e receber com vencimento | Parcial | Vendas pendentes e movimentos; falta agenda financeira com vencimentos/baixa parcial |
| Demonstrativo de resultados / lucro | Ausente | Faturamento não é lucro; requer custos, categorias e competência |
| Ticket médio | Ampliado nesta entrega | Por venda paga, data de pagamento e dedução de reembolsos online conhecidos |
| Link de pagamento | Existente, UX refeita | Stripe Connect; não utiliza Pagar.me |
| Conta digital Stone integrada | Sem equivalente | Stripe Connect é conta vinculada de recebimentos, não conta bancária PJ com Pix |
| Maquininha Belezinha integrada | Ausente — integração externa | Exige contrato/provedor e homologação de terminal; não é possível reproduzir a rede Stone só com código |
| Pix integrado e conciliado | Parcial | Registro manual de Pix; não há QR Pix online conciliado pelo provedor |
| Cálculo de comissão por profissional | Existente | Serviço após desconto, regra individual e confirmação de recebimento |
| Split e pagamento automático a profissionais | Ausente — integração externa | Repasse Connect atual é ao estabelecimento; comissão calculada não é transferência bancária |
| Repasse em lote via conta digital | Ausente — integração externa | Exige contas de beneficiários, autorização e conciliação de transferências |
| Antecipação de recebíveis | Ausente — oferta do provedor | Depende de elegibilidade, contrato e disponibilidade financeira |
| Cobrança recorrente / clube de assinaturas | Ausente — prioridade 1 | Planos para consumidores, direitos de uso, renovação, inadimplência e cancelamento; assinatura SaaS não atende isso |
| Fidelidade por visitas e desconto | Existente | Configuração e validação no checkout presencial; resgate online ainda indisponível |
| Estoque e venda de produtos | Existente básico | Cadastro, quantidades, baixa transacional e devolução de reserva online expirada |
| Alertas de reposição | Ausente — prioridade 2 | Estoque mínimo por item e alertas reais |
| Consumo interno de insumos | Ausente — prioridade 2 | Ficha técnica por serviço e baixa de consumo separada de venda |
| Valor do estoque e relatórios de reposição | Parcial | Quantidade disponível; faltam custo de aquisição e valorização |
| Entrada de estoque por nota fiscal | Ausente — integração externa | Importação e conciliação de documento fiscal |
| Nota de serviço, consumidor e profissional-parceiro | Ausente — integração externa | Emissor fiscal, municípios/SEFAZ, certificados quando exigidos e homologação |
| Repasses bancários do estabelecimento | Existente via Stripe | Histórico/agenda do provedor; cadastro e banco geridos na Stripe, sem promessa de repasse instantâneo |

## Relacionamento e aquisição

Fonte: [comunicação](https://negocios.trinks.com/solucoes/comunicacao-para-ir-alem/), [salões](https://negocios.trinks.com/negocios/saloes-de-beleza/).

| Recurso público | AgendaAI | Evidência / trabalho necessário |
|---|---|---|
| Lembretes e confirmações automáticos WhatsApp | Parcial | Links/ações de contato não equivalem a rotina WhatsApp homologada com templates e entrega |
| Mensagens de aniversário | Parcial | Consulta de aniversários; falta automação gerida pelo estabelecimento |
| Convites automáticos de retorno | Parcial | Agendar próxima visita existe; falta campanha segmentada de recuperação com controle de envio |
| SMS / lembrete premium | Parcial | Fila, worker e configuração presentes; envio real desativado até homologação |
| E-mail marketing do estabelecimento | Ausente — prioridade 2 | Prospecção do AgendaAI não equivale a campanhas dos clientes do SaaS |
| Pesquisa de satisfação e comentários | Ausente — prioridade 1 | Token por atendimento concluído, uma resposta, indicadores e acompanhamento privado |
| Clube com benefícios e descontos | Ausente — prioridade 1 | Diferenciar fidelidade por visitas de assinatura recorrente paga |
| Integração Google Reserve | Ausente — parceria externa | Link público não equivale a integração nativa Google Reserve |
| Agendamento em Instagram/Facebook | Parcial | Link público compartilhável; botões nativos/integração dependem dos provedores |
| Atendimento IA integrado ao WhatsApp | Parcial, sem equivalência homologada | Infraestrutura de workflows/classificação; falta comprovar conversa, disponibilidade, reserva e entrega ponta a ponta |
| Marketplace e aplicativo de busca/agendamento | Ausente | Página individual de reserva não é marketplace com aquisição/distribuição própria |

## Relatórios, expansão e serviços

Fonte: [expansão](https://negocios.trinks.com/solucoes/para-expandir-sem-limites/), [redes](https://negocios.trinks.com/negocios/redes-e-franquias/), [planos](https://negocios.trinks.com/planos/), [institucional](https://negocios.trinks.com/).

| Recurso público | AgendaAI | Evidência / trabalho necessário |
|---|---|---|
| Mapa de calor de movimento | Implementado nesta entrega | Dias × hora de início; exclui cancelados, faltas e futuro; sem inventar ocupação |
| Desempenho por profissional | Implementado nesta entrega | Agendados, concluídos, faltas e cancelamentos em 30/90 dias |
| Retorno de clientes | Implementado nesta entrega | Clientes identificados com 2+ visitas concluídas no período; denominador explícito |
| Dashboard e relatórios financeiros | Parcial, ampliado | Recebido, ticket, vendas pagas, CSV e caixa; não equivale a catálogo de 130 relatórios |
| Relatórios consolidados de redes | Ausente — prioridade 3 | Hierarquia de rede/unidade, permissões e agregações; console Owner é operação do SaaS |
| Gestão centralizada de unidades | Parcial na infraestrutura | Isolamento por estabelecimento não é gestão padronizada de franquia |
| Transferência e estoque unificado entre unidades | Ausente — prioridade 3 | Transferência com dupla movimentação e auditoria |
| Aplicativo exclusivo / white label | Ausente — prioridade 3 | Marca, publicação nas lojas, unidade e gestão de versões |
| Integração por API para parceiros | Parcial interno | Endpoints internos não são API pública com documentação, credenciais e limites por parceiro |
| Migração assistida | Parcial | Importação CSV de clientes; falta agenda/histórico e serviço de implantação assistida |
| Onboarding personalizado | Parcial | Preparação guiada e pedido de ajuda; serviço humano depende de operação |
| Suporte humano | Parcial | Chamados e acompanhamento; disponibilidade/SLA precisam de equipe real |
| Academia e materiais educativos | Parcial | Material comercial não é academia estruturada de aprendizado |
| Treinamentos ao vivo e webinars | Ausente — operação | Exige calendário, conteúdo e equipe; não criar sessões fictícias |
| Comunidade de gestores | Ausente — operação | Exige moderação e participação reais |
| Programa de vantagens com parceiros | Ausente — parcerias | Benefícios precisam de acordos válidos |
| Acesso em nuvem e pelo celular | Existente | Aplicação web responsiva; validar fluxos continuamente |
| Backup e atualizações automáticas | Parcial operacional | Deploy em Vercel; verificar política de backup/restore do plano Supabase e ensaio de recuperação |

## O que esta entrega muda

1. Stripe sai dos primeiros passos. Nova rota `/admin/recebimentos`, com acesso em **Gerenciar → Recebimentos online** e atalho no Caixa, exclusiva para o dono.
2. Estados distintos: não vinculada, cadastro pendente, pronta para ativar e recebimentos ativos. Aceite de taxas antes de vincular/ativar. Sem popup interno adicional.
3. Cobranças, reembolsos e repasses organizados em seções; totais limitados explicitamente à lista recente. Repasses continuam sob regras da Stripe.
4. Retorno e atualização do onboarding Stripe voltam à nova rota.
5. Relatórios de 30/90 dias, movimento, retorno, faltas e equipe; exportação CSV com proteção contra fórmulas em textos.
6. Recebimentos financeiros pela data de pagamento, com dedução de reembolso online parcial. Não chamar receita de lucro. Consultas paginadas, cancelamento por troca de estabelecimento e erro visível sem zeros falsos.

## Sequência de implementação das lacunas

Este documento é um backlog verificável, não uma declaração de paridade concluída. O trabalho abaixo ainda não foi implementado nesta entrega.

| Ordem | Entrega | Critério de aceite |
|---|---|---|
| 1 | Fila e rodízio | Persistência por estabelecimento, operação sem modal, duas recepções não chamam o mesmo cliente/profissional |
| 2 | Satisfação pós-atendimento | Uma resposta por token/atendimento, acesso privado do dono e taxa de resposta com denominador |
| 3 | Pacotes de sessões | Venda, validade, saldo, consumo e estorno idempotentes; comissão e checkout sem duplicar receita |
| 4 | Clube de assinaturas | Planos, cobrança Connect, benefícios, renovação e inadimplência por webhook; separar do plano SaaS |
| 5 | Sinal na reserva | Reserva temporária, pagamento confirmado, liberação de expiração e abatimento no saldo |
| 6 | Relacionamento | Preferências/canais, templates, supressão, agenda de campanhas e entrega confirmada por provedor |
| 7 | Estoque e financeiro gerencial | Mínimos, consumo, custos, vencimentos e resultado por competência |
| 8 | Estética e petshops | Fichas adequadas ao segmento, permissões e histórico; pet/tutor não tratados como a mesma entidade |
| 9 | Integrações contratadas | Fiscal, maquininha/Pix, Google Reserve e split após disponibilidade comercial e testes do provedor |
| 10 | Redes e plataforma de parceiros | Unidades, consolidação, transferências, API pública e aplicativos de marca |

Regra de produto: manter Hoje, Agenda, Clientes e Caixa como rotina principal. Recursos avançados entram no contexto certo e são opcionais. Não acrescentar os módulos futuros aos primeiros passos. Cada lote precisa testar isolamento de estabelecimento, concorrência quando houver dinheiro/saldo, estados vazios/erro e usabilidade em 390 px.

## Validação desta entrega

Testes automatizados de métricas, privacidade/contratos Connect e estados da nova interface. Build Angular e tipagem das APIs. Navegação em navegador com backend simulado e captura em celular/desktop. Colunas das consultas conferidas no banco de produção. Nenhuma cobrança, transferência, mensagem a cliente ou conta Stripe real é criada pelos testes. Homologação financeira real e sucesso de onboarding com a chave da plataforma continuam sendo verificações separadas.
