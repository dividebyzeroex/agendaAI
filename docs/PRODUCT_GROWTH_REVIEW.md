# Valor, ativação e controle do AgendaAI

Base: develop 01c8ade, após os recursos Hotmart existentes. Nenhuma implementação foi reaproveitada substituindo a aplicação por uma versão antiga. Não houve envio de novas propostas nem alteração de contas reais de clientes nesta entrega.

## Diagnóstico confirmado em 14/10/2026

A auditoria identificou testes sem disponibilidade pública compatível, uma configuração sem serviços nem equipe, mensagens antigas na fila e status comerciais sem mensagem vinculada. Uso pontual não prova uso recorrente e status de CRM não substitui evidência do provedor. As contagens reais ficam disponíveis apenas no Owner autenticado.

Não é possível concluir que a objeção seja preço. O primeiro problema observado é chegar a uma agenda utilizável. Campos de diagnóstico agora permitem registrar objeção relatada pelo prospect, sem inferi-la pela ausência de resposta.

## Melhorias implementadas

- Demonstração interativa de barbearia, salão, estética e pet, sem cadastro e sem gravar clientes, reservas ou cobranças.
- Início guiado com revisão de serviços, preço e duração, criação de primeiro profissional, vínculo de serviços e disponibilidade. Dias fechados selecionados são abertos; horários ativos existentes são preservados. Todas as alterações são atômicas e exigem dono do estabelecimento.
- Importação CSV em lotes de até 500, prévia e validação, deduplicação por contato, proteção contra importação parcial e sem publicidade aos clientes importados.
- Reservas pet com identificação, porte e orientações no registro do atendimento. Não é um prontuário veterinário nem um módulo clínico.
- Owner com contagens globais reais, ativação, uso, próximos passos, evidências comerciais, ledger de produção, usuários, bloqueios auditados e saúde baseada em registros. Views anteriores de equipe, suporte, caixa e configurações permanecem acessíveis.
- Última autenticação do auth e última atividade observada são distintas. A telemetria começa nesta implantação, sem inventar histórico. Bloqueio de autenticação não cancela cobrança; tokens existentes podem valer até o vencimento.
- Cupons reais no Stripe: apenas Owner, 5%-30%, primeira fatura, até dez resgates, 14 dias, primeira transação. Contratações multi-mês recebem desconto sobre a primeira fatura inteira. Cupons não alteram a licença Hotmart.
- Três mini-guias gratuitos em PDF, distintos do e-book comercial de R$899. Template HTML por segmento leva primeiro à demonstração e depois ao piloto. Não divulgue cupons antes de sua criação no Stripe.

## Como prospectar daqui em diante

1. Confirmar segmento e um sinal concreto no site oficial.
2. Oferecer o guia gratuito do segmento, anexado quando possível, sempre com URL de alternativa. Não afirmar que existe anexo se ele não foi realmente incluído.
3. Convidar a testar uma rotina na demonstração. Não pedir migração completa antes do primeiro valor.
4. Perguntar qual tarefa toma tempo e registrar a resposta real como diagnóstico.
5. Acompanhar primeiro serviço, profissional, horários e primeiro agendamento. Não oferecer desconto para resolver falha de configuração.
6. Se preço for objeção confirmada após o uso, o Owner pode criar cupom temporário; informar prazo, primeira fatura e preço normal depois.
7. Respeitar recusas, descadastros e falhas; não reenviar propostas antigas sem reconciliação. Não presumir abertura ou entrega pelo estado sent.

## Métricas e limites

Clientes: estabelecimento com responsável de e-mail verificado, excluindo proprietários da plataforma. Testes: acesso ativo com período de teste vigente, sem licença paga vigente. Assinantes: Stripe de produção, período pago vigente e evidência no ledger. MRR: contratos recorrentes ativos de produção; licença com prazo não é MRR. Receita: recebimentos brutos BRL confirmados no ledger, antes de taxas, não fluxo de caixa líquido. O ledger é a fonte disponível, sem supor cobertura bancária total. Funil de aquisição e ativação exibe bases distintas; não é uma atribuição causal.

Agregados consultam todos os registros. Listas operacionais mostram os 200 envios/usuários mais recentes e até 100 pagamentos. Não há telemetria de abertura de e-mails, disponibilidade global ou tokens de IA: o Owner informa a limitação, sem valores inventados. A atualização mede o tempo da consulta atual, não latência global.

## Referências de mercado consultadas

- Trinks, solução para salões: https://negocios.trinks.com/negocios/saloes-de-beleza/
- Trinks, barbearias e clube de assinatura: https://negocios.trinks.com/negocios/barbearias/
- Trinks, gestão e migração em redes: https://negocios.trinks.com/negocios/redes-e-franquias/
- SimplesVet, banho e tosa: https://simples.vet/petshop-banho-e-tosa/
- SimplesVet, checklist de atendimento: https://suporte.simples.vet/pt-BR/articles/8955593-como-preencho-o-checklist-do-banho-e-tosa-para-o-atendimento

Os concorrentes sustentam valor em operação, relacionamento e controle. A prioridade desta versão é tornar a rotina testável e mensurável; ela não implica paridade em recursos fiscais, clínica veterinária, clubes ou integrações de WhatsApp.

## Validação e situação da entrega

- 77 testes aprovados (componentes Owner, navegação, ativação, CSV, contatos, reserva, cobrança e regressões). O executor limita concorrência para os testes WebAssembly de banco e componentes não competirem sem controle.
- TypeScript das APIs e compilação Angular aprovados. Orçamento de funções verificado: 12 entradas serverless. /api/ping foi mantido por rewrite para a função comercial, evitando uma 13ª função.
- Migração aplicada e consulta Owner conferida no banco real. Testes locais verificam negação para anônimo e outro cliente, isolamento de empresa, rollback do início guiado, abertura de dia antes inativo, reserva compatível, importação atômica, duplicidade e registro de atividade sem parâmetros de URL.
- Funções de agregação e atividade usam SECURITY DEFINER de forma intencional: a primeira verifica a tabela privada de proprietários antes de ler auth e outras empresas; a segunda verifica o usuário autenticado e sua participação na empresa. Não são executáveis por anônimo. A tabela privada de atividade não possui acesso direto por usuários de aplicação.
- Três guias de quatro páginas gerados e renderizados para inspeção de diagramação.
- As rotinas existentes de Pesquisa, Comercial e Sucesso do Cliente receberam as novas orientações, sem retomar automações pausadas. Divulgar a nova demonstração ou anexos depende de confirmar publicação e arquivos válidos.
- A prévia Vercel não foi publicada: upload retornou 403/scope-not-accessible para a equipe configurada; a CLI confirmou falta de acesso ao mesmo escopo. A publicação do código no repositório público permanece dependente da autorização solicitada anteriormente. Código, migração e guias estão prontos nesta branch.
- Download do navegador de validação retornou arquivo incompleto. Testes de componentes e build não substituem homologação visual completa em Safari/iPhone e Chrome/Android. Nenhuma cobrança ou alteração de acesso real foi feita na validação.
