# AgendaAI — Estratégia de precificação (piloto)

## Regras de produto
- Novas ofertas: Agenda R$79/mês e Gestão R$119/mês, com os mesmos ciclos vigentes (1,3,6,12 meses e descontos 0/5/10/20%). Todo valor exibido é uma hipótese de lançamento que pode ser revisto apenas para novas contratações.
- Growth R$169/mês é **prévia, não contratável**. Automações e módulos adicionais não podem ser cobrados até que disponibilidade, limites e custos estejam validados.
- As assinaturas pré-existentes com IDs `basico`, `completo` e `premium` permanecem reconhecidas, sem migração automática de valor ou cancelamento.
- O Stripe sempre recebe preço calculado no servidor a partir do catálogo; valores enviados pelo navegador nunca são autoritativos.
- As diferenças entre Agenda e Gestão nesta fase são de pacote comercial e nível de acompanhamento. **Bloqueios técnicos de funcionalidades por plano ainda não foram implementados em APIs/RLS.** Antes de prometer exclusividade ou restringir recursos, implementar autorização de capacidades no backend. Não remover acesso de clientes legados.
- Serviços externos sujeitos a cobrança variável (Stripe, mensageria e IA) são informados antes de contratar.

## Pricing Intelligence
Estimativa exploratória: contribuição = preço * (1 - imposto provisório - tarifa variável de processamento) - custo variável mensal - tarifa fixa. As taxas são hipóteses editáveis do Owner. CAC inclui, quando indicado, 100% da primeira mensalidade paga ao parceiro. LTV estimado = contribuição / churn mensal, com aproximação geométrica e não aplicável se churn for 0. O Owner não altera preços automaticamente; decisão requer revisão e publicação controlada.

## Antes de promover para produção
1. Validar checkout Stripe e webhook para `agenda` e `gestao` em modo teste.
2. Revisar termos comerciais, descontos plurimensais e a descrição do pacote contratado.
3. Validar a margem com custos operacionais reais e impostos do regime tributário.
4. Validar e implantar gates de recursos se diferenciação funcional for comercializada.
5. Testar downgrade/upgrade sem perder o acesso de assinaturas legadas (a interface atual exige cancelar o contrato existente antes de contratar outro).
6. Executar testes unitários, build Angular, typecheck API e revisão de preview.
