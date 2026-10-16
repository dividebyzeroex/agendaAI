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
| Solicitação de reserva sujeita a aprovação | Implementado | Preferência em Página de reservas; pedido pendente com horário reservado, aviso público e aprovação na agenda |
| Agendamentos recorrentes | Existente com limite | Séries internas de até 12 visitas; não é assinatura nem recorrência pública ilimitada |
| Fila de clientes sem hora marcada | Implementado | Fila persistente, cliente/serviço/preferência e chamada atômica na Agenda → Fila |
| Rodízio de profissionais | Implementado | Ativar/pausar, ordem por última chamada, expediente, pausa e conflitos; lock por estabelecimento |
| Cadastro de clientes e histórico | Existente | `cliente.service`, detalhes do atendimento e histórico de visitas |
| Cadastro de profissionais e serviços | Existente | Equipe, duração/preços e vínculo profissional–serviço |
| Autonomia do profissional | Existente na web | Portal profissional, agenda e comissões com permissões |
| Aplicativo nativo para profissionais | Ausente | Acesso web responsivo não equivale a app nativo de loja |
| Fechamento de conta com serviços e produtos | Existente | Caixa atômico e comanda digital |
| Pacotes de serviços e controle de sessões | Implementado | Venda no caixa ou Stripe, liberação após pagamento, validade, consumo e estorno; sem nova receita no resgate |
| Fichas de anamnese personalizadas | Implementado com limites | Modelos, snapshot de versão, respostas/consentimento e acesso restrito ao dono; sem assinatura digital |
| Sinal de reserva | Implementado | Percentual opcional, reserva pendente, confirmação Stripe, expiração verificada e abatimento no fechamento |
| Autoatendimento com check-in | Parcial, ampliado | Check-in por link de atendimento confirmado, janela de 2h, sem iniciar serviço; modo terminal dedicado pendente |
| Site público do estabelecimento | Parcial, ampliado | Mensagem personalizada e galeria de até 12 imagens HTTPS na página de reservas; sem domínio/site independente |

## Financeiro, pagamentos e estoque

Fonte: [finanças](https://negocios.trinks.com/solucoes/simplificar-financas/), [clínicas](https://negocios.trinks.com/negocios/clinicas-de-estetica/).

| Recurso público | AgendaAI | Evidência / trabalho necessário |
|---|---|---|
| Abertura, entradas, saídas e fechamento de caixa | Existente | RPCs atômicas e relatório de fechamento |
| Contas a pagar e receber com vencimento | Implementado com limites | Vencimento, categoria, competência, saldo, baixas parciais idempotentes e cancelamento sem baixas; registros gerenciais não movimentam o caixa físico |
| Demonstrativo de resultados / lucro | Implementado gerencial | Vendas, consumo/vencimento de créditos, devoluções, custos capturados, comissões, títulos classificados e taxas; ausência de custo/taxa é sinalizada |
| Ticket médio | Ampliado nesta entrega | Por venda paga, data de pagamento e dedução de reembolsos online conhecidos |
| Link de pagamento | Existente, UX refeita | Stripe Connect; não utiliza Pagar.me |
| Conta digital Stone integrada | Sem equivalente | Stripe Connect é conta vinculada de recebimentos, não conta bancária PJ com Pix |
| Maquininha Belezinha integrada | Ausente — integração externa | Exige contrato/provedor e homologação de terminal; não é possível reproduzir a rede Stone só com código |
| Pix integrado e conciliado | Parcial | Registro manual de Pix; não há QR Pix online conciliado pelo provedor |
| Cálculo de comissão por profissional | Existente | Serviço após desconto, regra individual e confirmação de recebimento |
| Split e pagamento automático a profissionais | Ausente — integração externa | Repasse Connect atual é ao estabelecimento; comissão calculada não é transferência bancária |
| Repasse em lote via conta digital | Ausente — integração externa | Exige contas de beneficiários, autorização e conciliação de transferências |
| Antecipação de recebíveis | Ausente — oferta do provedor | Depende de elegibilidade, contrato e disponibilidade financeira |
| Cobrança recorrente / clube de assinaturas | Implementado | Mandato mensal explícito, cartão salvo pela Stripe, taxa fixa de R$ 1 por pagamento, calendário mensal, inadimplência, regularização e cancelamento pelo cliente |
| Fidelidade por visitas e desconto | Existente | Configuração e validação no checkout presencial; resgate online ainda indisponível |
| Estoque e venda de produtos | Existente básico | Cadastro, quantidades, baixa transacional e devolução de reserva online expirada |
| Alertas de reposição | Implementado | Mínimo por produto, lista de reposição e indicador na gestão de estoque |
| Consumo interno de insumos | Implementado | Insumos por serviço e baixa explícita no atendimento concluído, uma vez por item/atendimento |
| Valor do estoque e relatórios de reposição | Implementado básico | Custo unitário, média ponderada nas entradas, valor atual e histórico de movimentos gerenciais |
| Entrada de estoque por nota fiscal | Ausente — integração externa | Importação e conciliação de documento fiscal |
| Nota de serviço, consumidor e profissional-parceiro | Ausente — integração externa | Emissor fiscal, municípios/SEFAZ, certificados quando exigidos e homologação |
| Repasses bancários do estabelecimento | Existente via Stripe | Histórico/agenda do provedor; cadastro e banco geridos na Stripe, sem promessa de repasse instantâneo |

## Relacionamento e aquisição

Fonte: [comunicação](https://negocios.trinks.com/solucoes/comunicacao-para-ir-alem/), [salões](https://negocios.trinks.com/negocios/saloes-de-beleza/).

| Recurso público | AgendaAI | Evidência / trabalho necessário |
|---|---|---|
| Lembretes e confirmações automáticos WhatsApp | Parcial | Links/ações de contato não equivalem a rotina WhatsApp homologada com templates e entrega |
| Mensagens de aniversário | Parcial | Consulta de aniversários; falta automação gerida pelo estabelecimento |
| Convites automáticos de retorno | Implementado | Regras opcionais de retorno, vencimento de pacote e inatividade; consentimento, rechecagem, deduplicação e intervalo de sete dias por cliente |
| SMS / lembrete premium | Parcial | Fila, worker e configuração presentes; envio real desativado até homologação |
| E-mail marketing do estabelecimento | Implementado com limites | Rascunho, público por consentimento/canal, agendamento explícito, Resend e cancelamento de contato; rotina a cada cinco minutos, até 3 campanhas × 10 destinatários por execução; sem retries de envio incerto |
| Pesquisa de satisfação e comentários | Implementado | Nota 1–5, comentário privado, um envio por token, link com validade e indicadores de resposta da lista |
| Clube com benefícios e descontos | Implementado para sessões | Ciclos mensais com débito automático e preço congelado no contrato; fidelidade por visitas separada; benefícios ilimitados não oferecidos |
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
| Relatórios consolidados de redes | Implementado para unidades do mesmo dono | Cadastros por unidade, recebimentos/devoluções do mês, cobranças pendentes, atendimentos e clubes; não confundir recebimento com lucro |
| Gestão centralizada de unidades | Implementado para unidades próprias | Rede, criação/vínculo de unidades, troca de contexto e permissões da equipe por unidade; faturamento e Connect independentes |
| Transferência e estoque unificado entre unidades | Transferência implementada | Estoque por unidade, saída no envio, entrada confirmada no destino, cancelamento, custo ponderado e auditoria; catálogo não é unificado automaticamente |
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

Este documento é um backlog verificável, não uma declaração de paridade concluída. A implementação abaixo foi ampliada nesta revisão; pendências permanecem explícitas.

| Ordem | Entrega | Situação atual / critério |
|---|---|---|
| 1 | Fila e rodízio | Implementado; persistência, operação inline e serialização por estabelecimento |
| 2 | Satisfação pós-atendimento | Implementado; nota/comentário privado e denominador de convites gerados |
| 3 | Pacotes de sessões | Implementado; venda presencial/Stripe, consumo e estorno; comissões proporcionais ao preço do pacote |
| 4 | Clube de assinaturas | Implementado com adesão explícita, renovação automática e regularização de inadimplência |
| 5 | Sinal na reserva | Reserva temporária, pagamento confirmado, liberação de expiração e abatimento no saldo |
| 6 | Relacionamento | Preferências, campanhas, segmentação, supressão e envio de e-mail implementados; aceito pelo provedor não comprova entrega; SMS/WhatsApp seguem dependências externas |
| 7 | Estoque e financeiro gerencial | Implementados estoque, títulos/baixas, DRE gerencial, projeção e conciliação Stripe |
| 8 | Estética e petshops | Fichas versionadas, consentimento, pets separados do tutor e histórico implementados; acesso de fichas restrito ao dono |
| 9 | Integrações contratadas | Fiscal, maquininha/Pix, Google Reserve e split após disponibilidade comercial e testes do provedor |
| 10 | Redes e plataforma de parceiros | Unidades, consolidação, transferências, API pública e aplicativos de marca |

Regra de produto: manter Hoje, Agenda, Clientes e Caixa como rotina principal. Recursos avançados entram no contexto certo e são opcionais. Não acrescentar os módulos futuros aos primeiros passos. Cada lote precisa testar isolamento de estabelecimento, concorrência quando houver dinheiro/saldo, estados vazios/erro e usabilidade em 390 px.

## Validação desta entrega

Testes automatizados de métricas, privacidade/contratos Connect e estados da nova interface. Build Angular e tipagem das APIs. Navegação em navegador com backend simulado e captura em celular/desktop. Colunas das consultas conferidas no banco de produção. Nenhuma cobrança, transferência, mensagem a cliente ou conta Stripe real é criada pelos testes. Homologação financeira real e sucesso de onboarding com a chave da plataforma continuam sendo verificações separadas.

## Novas áreas implementadas em 16/10/2026

- `/admin/fila`: fila e rodízio; atalho também na Agenda.
- `/admin/fidelizacao`: pacotes, ofertas de clube, ciclos, saldos e estorno de sessão. Use “Usar pacote ou clube” no atendimento concluído. A comissão usa preço do pacote dividido pelas sessões. Não há nova receita no resgate. Pacotes online só ficam ativos após confirmação Stripe. Ciclos avulsos são renovados por nova venda. Débito mensal automático usa adesão em `/admin/clube`, com autorização do cliente.
- `/admin/satisfacao`: avaliações e resposta; convide pela página do atendimento. `/avaliar/:token` não expõe contatos.
- `/admin/financeiro`: títulos gerenciais e baixas parciais; não representam transações bancárias iniciadas pelo sistema nem lançamentos no caixa físico.
- `/admin/estoque`: mínimo/custo, movimentos e receitas de insumos. Consumo é confirmado explicitamente no atendimento, não disparado automaticamente por mudar um status.
- `/admin/fichas`: modelos, consentimento, histórico e pets/tutores. Modelos preenchidos ficam preservados em snapshot.
- `/admin/relacionamento`: preferências, campanhas e público. Preparar não envia. Agendar e-mail habilita o processamento a cada cinco minutos, após a data escolhida; lotes limitados a 3 campanhas e 10 destinatários por campanha em cada execução. Envio aceito pelo Resend não comprova entrega ao cliente. Falhas/incertezas não entram em retry automático. SMS/WhatsApp permanecem sem campanha automática até integração real.
- `/admin/pagina`: apresentação, galeria e aprovação opcional. Pedidos pendentes bloqueiam o horário e podem ser aprovados na página do atendimento.
- `/checkin/:token`: registra chegada nas duas horas anteriores ao horário confirmado, até seu fim, sem iniciar atendimento nem aprovar pedido pendente.
- `/preferencias/:token`: revoga o canal da campanha sem expor dados pessoais.

Todas as áreas ficam em Gerenciar, fora dos primeiros passos. Listas administrativas têm limite explícito de 500 registros recentes; quando houver truncamento, os indicadores avisam que se referem somente à lista. Clientes e profissionais continuam usando os cadastros existentes.

Após os cinco módulos abaixo, continuam pendentes: API pública para parceiros, publicação de apps, emissor fiscal, integração de maquininha/Pix/Google Reserve, atendimento WhatsApp/IA homologado e serviços humanos/comerciais (comunidade, treinamentos, parcerias). Nenhuma dessas capacidades foi simulada como concluída.

## Estado da liberação desta revisão

A migração `20261016131102_business_modules.sql` foi aplicada no Supabase de produção em 16/10/2026, após aprovação explícita do proprietário. O bloqueio inicial da revisão automática foi respeitado; a aplicação só ocorreu depois da aprovação. Verificação de produção: 17 tabelas criadas, todas com RLS e sem SELECT para anon; operação autenticada protege ausência de identidade; avaliação, revogação de contato e preparação de reembolso executáveis apenas pelo backend. A apresentação pública retorna somente mensagem, galeria e preferência de aprovação.

O build da develop foi aprovado no Vercel. A atualização da aplicação de produção deve usar este mesmo conjunto de fontes; homologação financeira e entrega real de mensagens continuam separadas dos testes com backend simulado.

### Escopo da migração aprovada

- 17 tabelas novas com RLS, leitura por estabelecimento e acesso de fichas/avaliações/relacionamento limitado ao dono.
- Duas colunas em `produtos`: estoque mínimo e custo unitário.
- Operações validadas em função privada, chamada autenticada pelo RPC `business_operation`; funções públicas de tokens de avaliação/cancelamento restritas ao backend.
- Um trigger em `caixa_itens` para ativar/cancelar passes quando o pagamento da venda muda de situação. Não altera vendas antigas ou o saldo dos caixas existentes.
- Sem excluir tabelas ou reescrever o histórico. Sem disparar e-mails, criar cobranças ou transferir dinheiro ao aplicar a migração.

Validação desta revisão: 153 testes automatizados de aplicação/APIs; migrações e cenários reais de SQL executados localmente, incluindo autorização, consumo/estorno de pacote, confirmação online, estoque, baixas parciais e fila; navegador a 390 px nas oito áreas, salvamento de formulários e resposta de avaliação com backend simulado. A homologação de transações reais continua separada.

Reembolso de pacote online: antes de pedir o reembolso ao provedor, o passe sem sessões consumidas fica congelado. Se o resultado financeiro for incerto, permanece indisponível para resgate até conferência. Pacotes usados exigem estorno das sessões antes do reembolso pela aplicação. Reembolsos presenciais seguem a mesma validação dentro da transação do caixa.


## Continuidade: campanhas sem bloqueio de lotes — 16/10/2026

- Campanhas sem novos destinatários pendentes passam a `completed`, liberando os próximos lotes. Envio previamente reivindicado e sem confirmação continua visível para conferência; não é repetido automaticamente e não bloqueia outras campanhas.
- Campanhas de estabelecimentos sem acesso ativo passam a `paused`. Após regularização, o dono retoma o agendamento explicitamente. Falhas ao consultar o acesso não são confundidas com suspensão.
- Espaçamento local de 550 ms entre tentativas no mesmo worker, prazo de 8 segundos para resposta do provedor e orçamento de 35 segundos para iniciar novos envios. Destinatários ainda não processados permanecem pendentes para a rotina seguinte. O limite diário atual de 3 campanhas e 10 destinatários por campanha permanece explícito.
- Totais por campanha são calculados no banco sobre todo o público. A lista é consultada por campanha, com páginas de 50 pessoas; não depende da antiga lista global de 500 destinatários.
- Contagens distinguem pendentes, aceitos pelo provedor, retirados e envios em conferência. Aceitação pelo provedor continua sem comprovar entrega.
- Migração aplicada e verificada no Supabase de produção: `20261016155712_campaign_worker_progress.sql`; amplia somente os estados permitidos, cria índices de fila e RPC de agregação com SECURITY INVOKER, RLS e autorização do dono. Não altera preferências nem dispara mensagens ao ser aplicada.
- Validação: 160 testes de aplicação/APIs, tipagem e build; todas as migrações e cenários de SQL locais, incluindo contagem de 511 destinatários e bloqueio de acesso anônimo/entre estabelecimentos; navegador com backend simulado a 390 px, oito áreas e paginação do público.

Na revisão seguinte, os cinco módulos de crescimento abaixo substituem esta pendência. A correção de campanhas, isoladamente, não criou cobranças, reembolsos ou transferências reais.


## Cinco módulos de crescimento — 16/10/2026

Esta revisão implementa o escopo aprovado de sinal, clube recorrente, DRE/projeção/conciliação, retenção e multiunidades. As capacidades abaixo têm backend, interface e testes; integrações externas fora desse escopo continuam identificadas na matriz.

### 1. Sinal opcional — Gerenciar → Página de reservas

- Percentual de 10% a 50%, ou desativado. Exige Connect ativo. Sinal mínimo R$ 2 e máximo de metade do serviço; serviços abaixo de R$ 4 não exigem sinal.
- Antecedência mínima de 45 minutos. Checkout Stripe com expiração fixa em 35 minutos. O horário é liberado somente após prova de expiração ou consulta completa ao provedor que confirme ausência de sessão.
- Registro de reserva, sinal, comanda e ordem ocorre em uma transação. Repetições usam chave e fingerprint do pedido; não criam outra reserva nem cobrança.
- Reserva permanece pendente até o pagamento. Se o dono exigir aprovação, continua pendente mesmo depois de pagar, até a aprovação da equipe.
- Caixa mostra o sinal confirmado, cobra apenas o saldo e calcula comissão sobre o serviço inteiro após desconto. Não há nova receita de caixa para o sinal no fechamento.
- Cancelamento/remarcação exige cancelar ou reembolsar a cobrança em Recebimentos. Reembolso pendente congela o uso. Saldo final pago precisa ser reembolsado antes do sinal.

### 2. Clube recorrente — Gerenciar → Clube recorrente

- Ofertas de clube são cadastradas em Pacotes e ofertas. O dono gera a adesão e compartilha `/clube/:token`; nenhum débito é feito só por criar o contrato.
- O cliente aceita o preço mensal, o uso futuro do cartão, o vencimento sem acumular sessões e o cancelamento. A Stripe coleta/salva o cartão. AgendaAI não recebe dados de cartão.
- Recorrência é gerida pelo AgendaAI com PaymentIntents `off_session` na conta vinculada; **não cria uma Stripe Billing Subscription**. Assim, a taxa da plataforma continua fixa em R$ 1 por pagamento, sem aproximação percentual. As taxas próprias da Stripe continuam adicionais.
- Cada vencimento tem ciclo e tentativa únicos. O calendário preserva o dia original, ajustando meses curtos: 31/jan → 28/fev → 31/mar. Pagamento regularizado com atraso inicia novo período sem cobrar automaticamente os meses perdidos.
- Sessões só são criadas após confirmação financeira. Cancelar renovação mantém os direitos do ciclo pago até vencer. Uma cobrança já iniciada pode concluir; reembolso de ciclo exige tratar sessões consumidas e cancela as próximas renovações.
- Falha de cartão/autenticação aparece como pagamento pendente. O cliente regulariza no link. Resultado de débito desconhecido nunca é repetido automaticamente: webhook, pesquisa positiva na Stripe e conciliação recuperam a tentativa; ausência em pesquisa não autoriza outro débito.

### 3. Visão financeira — Gerenciar → Visão financeira

- DRE gerencial por competência: vendas/serviços, sessões consumidas, créditos vencidos, outras receitas, descontos/devoluções, impostos, custos, margem, comissões, despesas operacionais/financeiras, taxas e resultado.
- Sinais antes da conclusão e créditos não vencidos ficam separados de receita. Reembolsos de pacotes são alocados proporcionalmente à parcela reconhecida e ao saldo; depois do vencimento, a devolução reverte receita já reconhecida.
- Custos de produtos são capturados na venda e os insumos no consumo. Custos não informados e valores históricos ausentes ficam explícitos; não se reconstrói custo antigo usando o preço atual. O resultado fica marcado como parcial quando faltam dados materiais.
- Títulos podem ser classificados ou excluídos do DRE para evitar duplicar venda/comissão já registrada. A classificação usa competência; a projeção usa o valor ainda em aberto e vencimento.
- Projeção de 30/60/90 dias parte do saldo inicial **informado**, inclui atrasados e compromissos cadastrados; não é consulta de saldo bancário nem previsão de vendas não realizadas.
- Conciliação lê cobranças da conta Stripe, confirma status/valores/taxas e registra devoluções e devoluções de taxa por data do provedor. Líquido das transações originais, reembolsos e retorno de taxas são exibidos separadamente. Não comprova crédito no extrato bancário.
- Consulta manual em lotes de até dez ordens, com prazo por execução; repita para conferir o próximo lote. Reembolsos pendentes não liberam reserva ou direitos como se estivessem concluídos.

### 4. Retenção — Gerenciar → Retenção automática

- Três regras opcionais: retorno após N dias, pacote com saldo perto do vencimento e recuperação de inativos. Começam desativadas.
- Somente e-mail autorizado. No máximo um convite automático por cliente em sete dias. A mesma visita/pacote não gera convite repetido pela mesma regra.
- Reserva futura, novo atendimento, perda de elegibilidade, revogação de contato ou regra desativada suprimem mensagens ainda não enviadas. Clubes com renovação automática não recebem convite de renovar pacote manual.
- Mensagens aceitas pelo provedor são contabilizadas como aceitas, sem afirmar entrega. Envios incertos ficam para conferência.

### 5. Minha rede — Gerenciar → Minha rede

- Criar rede, criar novas unidades ou vincular unidades já pertencentes ao mesmo usuário. Não concede acesso a outra empresa nem representa gestão jurídica de franquias independentes.
- Seletor no topo muda a unidade. Agenda, clientes, equipe, caixa, plano e conta Stripe permanecem separados. Proprietário pode abrir unidade vencida para regularizar a assinatura; colaboradores não recebem acesso operacional vencido.
- Consolidado real por unidade e mês: cadastros, recebimentos líquidos de devoluções registradas, cobranças pendentes, atendimentos concluídos e clubes ativos. Pessoas cadastradas em duas unidades contam como dois cadastros.
- Permissão de atendimento, recepção ou financeiro por cadastro profissional/unidade, com ativação/bloqueio. O backend reavalia o vínculo; token de login não autoriza manter uma permissão removida.
- Transferência com retirada da origem, estado em trânsito, confirmação no destino, custo ponderado, cancelamento devolvendo à origem uma vez e auditoria. O usuário confirma produtos equivalentes e unidades de medida; não há catálogo global/SKU inferido automaticamente.

### Execução assíncrona e operação

- Rotina PostgreSQL `pg_cron` + `pg_net` chama o endpoint existente a cada cinco minutos. Não adiciona funções serverless ao limite de 12 do Vercel.
- Credencial aleatória criada no esquema privado, sem retorno ao navegador; endpoints de claim/finalização executáveis somente pelo backend. Lease de 90 segundos impede dois workers de cobrar/enviar ao mesmo tempo.
- Limites por execução: até cinco contratos de renovação, três campanhas com dez destinatários cada, cinco reservas a conferir e cinco pagamentos de clube a reconciliar; orçamento por rotina preserva a duração da função. A fila continua no próximo ciclo de cinco minutos, sem repetir um débito incerto.
- A rotina diária anterior de lembretes continua separada. Regras novas e contratos existentes não são ativados por migração.
- Migrações: `20261016161458_growth_payments.sql`, `20261016161501_growth_management.sql`, `20261016162857_growth_worker_schedule.sql`. Onze tabelas públicas novas com RLS, uma tabela privada de controle, operações autenticadas com isolamento e funções de pagamento somente para o backend.
- Homologação de cartão, onboarding e entrega real de mensagem continuam distintas dos testes simulados. Nenhum teste desta revisão cobra cartão, envia mensagem a cliente ou faz transferência bancária real.


### Validação e liberação dos cinco módulos

- 180 testes de aplicação/APIs aprovados; migrações e cenários de dinheiro/sessões, inadimplência, expiração, DRE, autorização e transferência executados no PostgreSQL local de validação. Onze novas tabelas públicas verificadas com RLS, sem leitura anônima e sem escrita direta pelo navegador.
- Build Angular e tipagem das APIs aprovados. Navegador com backend simulado em 390 e 1440 px, sem overflow; criação de adesão, consentimento/cancelamento, configuração de retenção e envio/recebimento de estoque.
- As três migrações de crescimento foram aplicadas no Supabase de produção. O nome remoto do lote de pagamentos é `growth_payment_features`. A agenda `agendaai-growth-workers` está ativa em `*/5 * * * *`.
- Ocorrência corrigida durante a liberação: a busca inicial incluiu e reaplicou por engano `20261014202051_owner_growth_intelligence.sql`, registrada remotamente com nome `growth_payments`. A única função sobreposta por revisão posterior era `owner_business_snapshot`. A migração de reparo `20261016170430_restore_owner_snapshot.sql` restaurou a projeção atual, e a verificação de produção confirmou `owner_business_snapshot_base`, `received_bookings` e ausência de execução anônima. Não foram disparadas cobranças ou reescritos saldos históricos por essa reaplicação.
- Os avisos de advisors sobre cotação/página/comanda públicas SECURITY DEFINER correspondem a projeções intencionalmente públicas, com campos limitados e token quando necessário. A tabela privada de controle não tem políticas de navegador: somente backend/cron pode acessá-la.

A troca de unidade também usa o cadastro profissional da unidade ativa, além da permissão. Ajuste adicional aplicado e testado em `20261016170752_unit_context_profile.sql`, sem usar o primeiro cadastro vinculado como contexto das demais unidades.

O cancelamento de próximas renovações funciona independentemente da disponibilidade da Stripe. Quando a consulta do provedor falha, o link do clube mantém os dados registrados e sinaliza que a atualização financeira está em conferência, sem impedir o cancelamento.
