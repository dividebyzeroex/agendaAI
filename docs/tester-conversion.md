# Conversão dos pilotos do AgendaAI

## Objetivo
Fazer o responsável experimentar o fluxo completo com dados reais: serviço, profissional, disponibilidade, agendamento e registro no caixa. Contratação voluntária depois de valor percebido, por R$97/mês no Essencial, até cinco profissionais ativos.

| Sinal registrado | Ação personalizada | Próximo passo |
| --- | --- | --- |
| Cadastro verificado há 48h com configuração incompleta | Identificar uma etapa faltante e ensinar como concluí-la | Responder com a dificuldade específica |
| Dúvida ou falha aberta | Responder à dúvida real; escalar erro sem solução comprovada | Retestar o fluxo afetado |
| Serviço e profissional ativos, três agendamentos reais | Apresentar resumo do uso e convidar à contratação opcional | Acessar a assinatura pelo aplicativo |
| Piloto termina em até sete dias | Mostrar uso comprovado, data real do fim e condições do plano | Escolher contratar ou concluir o teste |
| Sete dias sem sinais recentes de uso | Oferecer ajuda para retomar; não afirmar abandono | Escolher uma tarefa pequena |

Propor como meta negociável cadastrar serviços, definir disponibilidade e registrar cinco agendamentos reais. A meta é convite, nunca resultado anunciado sem evidência. Distinguir registros cancelados, demonstrativos e reservas reais ao calcular valor.

## Abordagem
Uma mensagem breve, uma pergunta e um próximo passo. Personalizar por serviço e lacuna observados. Priorizar solução da dificuldade antes de venda. Apresentar agendamentos e clientes registrados como uso do produto, não receita ou novas vendas atribuídas ao AgendaAI. Não inventar descontos, prazo promocional ou escassez. Não renovar teste, alterar plano ou cobrar sem ação autorizada do cliente.

## Controles
Automação AgendaAI Sucesso do Cliente consulta Supabase e Gmail. Contatos proativos em dias úteis 09h–18h, até cinco por dia, intervalo mínimo de sete dias por responsável e no máximo dois sem resposta em trinta dias. Respostas a dúvidas iniciadas pelo cliente são tratadas separadamente. Recusas e devoluções suspendem contato. Histórico, checkpoints de envio e IDs Gmail ficam em commercial_agent_runs, agent customer_success. Configuração da rotina não conta como atendimento realizado.

## Medição
Comparar cadastro verificado → configuração operacional → primeiro agendamento real → uso recorrente → assinatura live confirmada. Registrar motivo de travamento e resultado de cada contato. Medir respostas, ativações e pagamentos confirmados; não atribuir conversão à mensagem apenas por proximidade de datas.
