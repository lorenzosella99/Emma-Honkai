# Política de Segurança — Emma Honkai

**Última atualização: 6 de novembro de 2026**

## 1. Objetivo

Esta política define as regras mínimas para proteger contas, personagens, conversas, banco de dados, repositórios, serviços e usuários do Emma Honkai. Ela se aplica ao mantenedor, administradores, colaboradores e qualquer pessoa autorizada a alterar o projeto.

## 2. Proteção de credenciais e segredos

Senhas, tokens pessoais de acesso, chaves de API, chaves privadas, códigos administrativos e credenciais de banco de dados são segredos. É proibido inserir esses valores no código do frontend, em arquivos públicos, commits, issues, comentários, capturas de tela, mensagens de suporte ou exemplos. Segredos devem ficar somente no gerenciador de segredos do serviço que realmente precisa deles, com o menor conjunto de permissões possível.

Tokens devem ter escopo mínimo, prazo de validade sempre que possível e rotação periódica. Se um segredo for compartilhado, publicado ou suspeito de exposição, deve ser revogado ou rotacionado imediatamente. Apagar o texto de um arquivo não remove necessariamente o segredo do histórico Git; o incidente também exige revisão do histórico e dos registros de acesso.

## 3. Separação entre frontend, backend e dados

O frontend público deve conter apenas código e configurações que possam ser vistos por qualquer visitante. Operações privilegiadas, validações de autorização, administração e acesso a credenciais devem ocorrer no backend. A chave privilegiada do Supabase e tokens de escrita do GitHub nunca podem ser enviados ao navegador.

O backend deve validar cada solicitação, verificar a sessão e a permissão do usuário e rejeitar campos, identificadores ou operações não autorizados. Não se deve confiar em verificações feitas apenas pelo JavaScript do navegador, pois o usuário pode modificar chamadas e dados enviados.

## 4. Contas, autenticação e sessões

Cada usuário deve utilizar sua própria conta e manter sua senha em sigilo. É proibido tentar acessar, adivinhar, reutilizar ou redefinir a senha de outra pessoa sem autorização. A equipe deve utilizar os mecanismos oficiais de autenticação e não deve armazenar senhas em texto puro, logs, arquivos JSON ou repositórios.

A criação de administradores deve ser restrita a um procedimento controlado no backend. Um cadastro comum não pode conceder privilégios administrativos apenas por enviar um campo no navegador. Ações administrativas devem confirmar a autorização no servidor em cada solicitação. Contas administrativas devem ser individuais, protegidas e utilizadas somente quando necessário.

## 5. Permissões e isolamento de dados

O banco de dados deve aplicar políticas de acesso no servidor, incluindo Row Level Security (RLS) quando suportado. Cada usuário só pode consultar ou alterar os dados que suas permissões autorizam. Chats privados, mensagens, perfis, personagens privados, denúncias e configurações administrativas devem ter regras específicas.

Personagens públicos podem ser apresentados conforme a função pública do produto, mas isso não torna públicos os dados privados de seus criadores. Não se deve ampliar permissões para resolver um erro de interface sem antes identificar a causa. Toda mudança em políticas, privilégios, funções ou tabelas deve ser revisada e testada com contas de diferentes níveis de acesso.

## 6. Repositórios e alterações de código

O repositório do frontend pode ser público e, por isso, todo arquivo nele deve ser considerado visível a qualquer pessoa. O repositório de dados deve permanecer privado. Nenhum dos repositórios deve conter senhas, tokens, dados reais de usuários, históricos privados de conversa ou cópias desnecessárias do banco.

Alterações devem ser feitas com revisão do arquivo atual, preservação de mudanças existentes e mensagens de commit claras. Antes de operações em massa, migrações ou exclusões, deve existir backup adequado e um plano de recuperação. Não se deve apagar contas, mensagens ou dados de produção sem autorização explícita e confirmação do alvo.

## 7. API, validação e prevenção de abuso

Toda entrada recebida do navegador deve ser considerada não confiável. O backend deve validar tipos, tamanhos, formatos, identificadores e limites de frequência. Deve impedir acesso a recursos de terceiros por troca de IDs, elevação de privilégios, falsificação de remetente, abuso de convites, spam e chamadas administrativas não autorizadas.

Mensagens e importações devem respeitar os limites definidos pelo serviço. Arquivos importados devem ser tratados como conteúdo não confiável, e o usuário deve ter direito de compartilhar o material. Erros enviados ao navegador devem ser úteis sem revelar tokens, SQL sensível, caminhos internos ou detalhes que facilitem ataques.

## 8. Moderação, denúncias e banimentos

Denúncias devem ser acessíveis somente a quem precisa analisá-las. A equipe deve tratar os relatos com confidencialidade, evitar expor denunciantes e preservar apenas as informações necessárias para apuração. Banimentos e outras medidas administrativas devem ser registrados de forma coerente e aplicados no backend, não apenas escondidos na interface.

É proibido usar ferramentas administrativas para perseguir usuários, divulgar conversas privadas, alterar dados por vingança ou conceder vantagens indevidas. Ações administrativas devem respeitar as regras públicas do serviço e ser proporcionais ao problema.

## 9. Logs, monitoramento e backups

Logs devem registrar informações suficientes para investigar falhas e abusos, mas não devem incluir senhas, tokens, chaves ou conteúdo privado desnecessário. O acesso aos logs deve ser restrito. Backups devem ser protegidos, ter acesso limitado e ser testados periodicamente; um backup que nunca foi restaurado em teste não deve ser considerado garantia de recuperação.

Backups e cópias antigas também são dados sensíveis e devem seguir controles de acesso e prazos de retenção. Antes de compartilhar logs para diagnóstico, remova nomes, IDs, mensagens e outros dados que identifiquem usuários sempre que não forem necessários.

## 10. Dependências e atualizações

Bibliotecas, ações do backend, políticas do banco e integrações devem ser mantidas atualizadas. Mudanças relevantes devem ser avaliadas quanto a riscos de segurança e compatibilidade. Dependências desconhecidas ou desnecessárias não devem ser adicionadas sem justificativa.

## 11. Comunicação de vulnerabilidades

Quem encontrar uma falha deve comunicar o mantenedor por canal privado e oficial, com uma descrição objetiva, impacto provável e passos mínimos para reproduzir. Não publique a falha, dados de usuários ou provas que permitam exploração antes de dar oportunidade razoável para correção. Não tente acessar dados de terceiros, apagar informações, interromper o serviço ou ampliar o acesso para provar uma vulnerabilidade.

A equipe deve confirmar o recebimento, avaliar o risco, corrigir ou mitigar a falha e informar o resultado quando possível. Se houver exposição de credenciais, a prioridade é revogar/rotacionar o segredo e revisar os acessos.

## 12. Resposta a incidentes

Diante de suspeita de invasão, vazamento ou alteração indevida, a equipe deve conter o acesso afetado, revogar credenciais comprometidas, preservar evidências sem divulgar dados pessoais, revisar logs e permissões, corrigir a causa e avaliar se usuários ou autoridades precisam ser comunicados conforme a legislação aplicável.

## 13. Limites desta política

Esta política estabelece práticas obrigatórias, mas não representa uma certificação, auditoria independente ou promessa de que o sistema esteja livre de vulnerabilidades. A segurança depende também dos fornecedores, da configuração real dos serviços, das atualizações e do comportamento de administradores e usuários.

---

## Resumo simples

- Nunca coloque senha, token ou chave secreta no código do site ou em repositório público.
- O site público não pode guardar poderes de administrador. Essas ações ficam no servidor.
- Cada pessoa só pode acessar contas, chats e personagens que tem permissão para ver.
- O repositório de dados deve continuar privado.
- Não compartilhe conversas, denúncias ou dados reais de usuários.
- Antes de apagar ou alterar muitos dados, faça backup e confirme o que será afetado.
- Se um token vazar, revogue-o e crie outro. Não basta apagar o texto.
- Se encontrar uma falha, avise o mantenedor em particular. Não use a falha para invadir ou prejudicar alguém.
- Administradores também precisam seguir as regras e não podem abusar dos poderes.
- Nenhum sistema é 100% seguro; é preciso revisar, atualizar e testar.

**Em poucas palavras:** segredo fica secreto, cada pessoa só acessa o que pode, e qualquer problema de segurança deve ser tratado rápido e sem expor os usuários.